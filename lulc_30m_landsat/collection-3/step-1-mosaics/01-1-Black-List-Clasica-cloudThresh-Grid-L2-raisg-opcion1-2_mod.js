// Configurable parameters
var param = {
    'grid_name': 'SF-20-Z-A',
    't0': '2024-06-01',
    't1': '2024-12-31',
    'satellite': 'L9',        // L4, L5, L7, L8, L9, LX, LY
    'cloud_cover': 40,
    'pais': 'Bolivia',    
    'regionMosaic': 210,
    'shadowSum': 3500,        // 0 - 10000, default 3500
    'cloudThresh': 5,         // 0 - 100, default 10
};

// Images excluded from processing (blacklist)
var blackList = [
    // Image Landsat Id, for example: 'LC08_230071_20240624'
];

// Auxiliary layers: grid and country boundary
var layers = {
    regions: 'projects/mapbiomas-raisg/DATOS_AUXILIARES/VECTORES/clasificacion-mosaicos-4',
    grids: 'projects/mapbiomas-bolivia/assets/AUXILIARY-DATA/VECTOR/cartas_mosaico'
};

var grid = ee.FeatureCollection(layers.grids)
    .filterMetadata('name', 'equals', param.grid_name);

var assetCountries = 'projects/mapbiomas-raisg/DATOS_AUXILIARES/VECTORES/paises-4';
var bol = ee.FeatureCollection(assetCountries).filter(ee.Filter.eq('name', 'Bolivia'));
Map.addLayer(bol.style({color: "red", fillColor: "00000010"}), {}, 'Bolivia', 0);

// Applies linear rescaling to a single band
var rescale = function(obj) {
    return obj.image
        .subtract(obj.min)
        .divide(ee.Number(obj.max).subtract(obj.min));
};

// Scale factors for optical and thermal bands (Landsat C02 L2)
var scaleFactors = function(image) {
    var optical = ['blue', 'green', 'red', 'nir', 'swir1', 'swir2'];
    var opticalBands = image.select(optical).multiply(0.0000275).add(-0.2).multiply(10000);
    var thermalBand = image.select('temp*').multiply(0.00341802).add(149.0).multiply(10);
    return image.addBands(opticalBands, null, true).addBands(thermalBand, null, true);
};

// Cloud mask based on brightness, temperature and NDSI
var cloudScore = function(image) {
    var cloudThresh = param.cloudThresh;
    var score = ee.Image(1.0);

    // Brightness in blue
    score = score.min(rescale({image: image.select('blue'), min: 1000, max: 3000}));
    // Brightness in visible (R+G+B)
    score = score.min(rescale({image: image.expression("b('red')+b('green')+b('blue')"), min: 2000, max: 8000}));
    // Brightness in infrared (NIR+SWIR1+SWIR2)
    score = score.min(rescale({image: image.expression("b('nir')+b('swir1')+b('swir2')"), min: 3000, max: 8000}));
    // Temperature (cold pixels are clouds)
    var temp = image.select('temp');
    score = score.where(temp.mask(), score.min(rescale({image: temp, min: 3000, max: 2900})));
    // NDSI to distinguish snow
    var ndsi = image.normalizedDifference(['green', 'swir1']);
    score = score.min(rescale({image: ndsi, min: 0.8, max: 0.6}))
        .multiply(100).byte();

    score = score.gte(cloudThresh).rename('cloudScoreMask');
    return image.addBands(score);
};

// TDOM: shadow mask based on temporal statistics of NIR and SWIR1
var tdom = function(obj) {
    var shadowSumBands = ['nir', 'swir1'];
    var irStdDev = obj.collection.select(shadowSumBands).reduce(ee.Reducer.stdDev());
    var irMean = obj.collection.select(shadowSumBands).mean();

    var collection = obj.collection.map(function(image) {
        var zScore = image.select(shadowSumBands).subtract(irMean).divide(irStdDev);
        var irSum = image.select(shadowSumBands).reduce(ee.Reducer.sum());

        var tdomMask = zScore.lt(obj.zScoreThresh)
            .reduce(ee.Reducer.sum()).eq(2)
            .and(irSum.lt(obj.shadowSumThresh))
            .not();
        tdomMask = tdomMask.focal_min(obj.dilatePixels);

        return image.addBands(tdomMask.rename('tdomMask'));
    });
    return collection;
};

// Shadow projection from clouds and solar geometry
var cloudProject = function(obj) {
    var cloud = obj.image.select(obj.cloudBand);
    var tdomMask = obj.image.select('tdomMask');
    var darkPixels = obj.image.select(['nir', 'swir1', 'swir2'])
        .reduce(ee.Reducer.sum()).lt(obj.shadowSumThresh);

    var nominalScale = cloud.projection().nominalScale();
    var meanAzimuth = obj.image.get('sun_azimuth_angle');
    var meanElevation = obj.image.get('sun_elevation_angle');

    var azR = ee.Number(meanAzimuth).multiply(Math.PI).divide(180.0).add(0.5 * Math.PI);
    var zenR = ee.Number(0.5).multiply(Math.PI).subtract(ee.Number(meanElevation).multiply(Math.PI).divide(180.0));

    var shadows = obj.cloudHeights.map(function(cloudHeight) {
        cloudHeight = ee.Number(cloudHeight);
        var shadowDist = zenR.tan().multiply(cloudHeight);
        var x = azR.cos().multiply(shadowDist).divide(nominalScale).round();
        var y = azR.sin().multiply(shadowDist).divide(nominalScale).round();
        return cloud.changeProj(cloud.projection(), cloud.projection().translate(x, y));
    });

    var shadow = ee.ImageCollection.fromImages(shadows).max().unmask();
    shadow = shadow.focal_max(obj.dilatePixels)
        .and(darkPixels)
        .and(tdomMask.not().and(cloud.not()));
    var shadowMask = shadow.rename('shadowTdomMask');

    return obj.image.addBands(shadowMask);
};

// Cloud mask using pixel_qa (Landsat)
var cloudBQAMaskSr = function(image) {
    var qaBand = image.select('pixel_qa');
    var cloudMask = qaBand.bitwiseAnd(Math.pow(2, 3))
        .or(qaBand.bitwiseAnd(Math.pow(2, 2)))
        .or(qaBand.bitwiseAnd(Math.pow(2, 1)))
        .neq(0)
        .rename('cloudBQAMask');
    return ee.Image(cloudMask);
};

var cloudBQAMask = function(image) {
    return image.addBands(cloudBQAMaskSr(image));
};

// Shadow mask using pixel_qa (Landsat)
var shadowBQAMaskSrLX = function(image) {
    var qaBand = image.select('pixel_qa');
    var shadowMask = qaBand.bitwiseAnd(Math.pow(2, 4)).neq(0).rename('shadowBQAMask');
    return ee.Image(shadowMask);
};

var shadowBQAMask = function(image) {
    var cloudShadowMask = ee.Algorithms.If(
        ee.String(image.get('satellite_name')).slice(0, 10).compareTo('Sentinel-2').not(),
        ee.Image(0).mask(image.select(0)).rename('shadowBQAMask'),
        shadowBQAMaskSrLX(image)
    );
    return image.addBands(ee.Image(cloudShadowMask));
};

// Applies combination of masks (cloud and shadow) according to options
var getMasks = function(obj) {
    var collection = ee.Algorithms.If(obj.cloudBQA,
        ee.Algorithms.If(obj.cloudScore,
            obj.collection.map(cloudBQAMask).map(cloudScore),
            obj.collection.map(cloudBQAMask)),
        obj.collection.map(cloudScore));
    collection = ee.ImageCollection(collection);

    collection = ee.Algorithms.If(obj.shadowBQA,
        ee.Algorithms.If(obj.shadowTdom,
            tdom({
                collection: collection.map(shadowBQAMask),
                zScoreThresh: obj.zScoreThresh,
                shadowSumThresh: obj.shadowSumThresh,
                dilatePixels: obj.dilatePixels,
            }),
            collection.map(shadowBQAMask)),
        tdom({
            collection: collection,
            zScoreThresh: obj.zScoreThresh,
            shadowSumThresh: obj.shadowSumThresh,
            dilatePixels: obj.dilatePixels,
        }));
    collection = ee.ImageCollection(collection);

    var getShadowTdomMask = function(image) {
        return cloudProject({
            image: image,
            shadowSumThresh: obj.shadowSumThresh,
            dilatePixels: obj.dilatePixels,
            cloudHeights: obj.cloudHeights,
            cloudBand: obj.cloudBand,
        });
    };

    collection = ee.Algorithms.If(obj.shadowTdom,
        collection.map(getShadowTdomMask),
        collection);
    return ee.ImageCollection(collection);
};

// Auxiliary modules
var bns = require('users/fantecnico3/MapBiomas_public_scripts:lulc/collection-3/General/modules/BandNames.js');
var col = require('users/fantecnico3/MapBiomas_public_scripts:lulc/collection-3/General/modules/Collection.js');
var dtp = require('users/fantecnico3/MapBiomas_public_scripts:lulc/collection-3/General/modules/DataType.js');
var ind = require('users/fantecnico3/MapBiomas_public_scripts:lulc/collection-3/General/modules/SpectralIndexes.js');
var mis = require('users/fantecnico3/MapBiomas_public_scripts:lulc/collection-3/General/modules/Miscellaneous.js');
var mos = require('users/fantecnico3/MapBiomas_public_scripts:lulc/collection-3/General/modules/Mosaic.js');
var sma = require('users/fantecnico3/MapBiomas_public_scripts:lulc/collection-3/General/modules/SmaAndNdfi.js');

// Main function that retrieves images applying blacklist and masks
var getImages = function(param, blackList, grid) {
    var options = {
        dates: { t0: param.t0, t1: param.t1 },
        collection: null,
        regionMosaic: param.regionMosaic,
        gridName: param.grid_name,
        cloudCover: param.cloud_cover,
        shadowSum: param.shadowSum,
        cloudThresh: param.cloudThresh,
        blackList: blackList,
        imageList: [],
        collectionid: param.satellite.toLowerCase(),
        collectionIds: {
            'l4': ['LANDSAT/LT04/C02/T1_L2'],
            'l5': ['LANDSAT/LT05/C02/T1_L2'],
            'l7': ['LANDSAT/LE07/C02/T1_L2'],
            'l8': ['LANDSAT/LC08/C02/T1_L2'],
            'l9': ['LANDSAT/LC09/C02/T1_L2'],
            'lx': ['LANDSAT/LT05/C02/T1_L2', 'LANDSAT/LE07/C02/T1_L2'],
            'ly': ['LANDSAT/LC08/C02/T1_L2', 'LANDSAT/LC09/C02/T1_L2'],
        },
        endmembers: {
            'l4': sma.endmembers['landsat-4'],
            'l5': sma.endmembers['landsat-5'],
            'l7': sma.endmembers['landsat-7'],
            'l8': sma.endmembers['landsat-8'],
            'l9': sma.endmembers['landsat-9'],
            'lx': sma.endmembers['landsat-5'],
            'ly': sma.endmembers['landsat-8'],
        },
        bqaValue: {
            'l4': ['QA_PIXEL', Math.pow(2, 5)],
            'l5': ['QA_PIXEL', Math.pow(2, 5)],
            'l7': ['QA_PIXEL', Math.pow(2, 5)],
            'l8': ['QA_PIXEL', Math.pow(2, 5)],
            'l9': ['QA_PIXEL', Math.pow(2, 5)],
            'lx': ['QA_PIXEL', Math.pow(2, 5)],
            'ly': ['QA_PIXEL', Math.pow(2, 5)],
        },
        bandIds: {
            'LANDSAT/LT04/C02/T1_L2': 'l4_sr2',
            'LANDSAT/LT05/C02/T1_L2': 'l5_sr2',
            'LANDSAT/LE07/C02/T1_L2': 'l7_sr2',
            'LANDSAT/LC08/C02/T1_L2': 'l8_sr2',
            'LANDSAT/LC09/C02/T1_L2': 'l9_sr2',
        },
        visParams: {
            bands: 'swir1,nir,red',
            gain: '0.008,0.006,0.02',
            gamma: 0.75
        }
    };

    var applyCloudAndShadowMask = function(collection) {
        var collectionWithMasks = getMasks({
            collection: collection,
            cloudBQA: true,
            cloudScore: true,
            shadowBQA: true,
            shadowTdom: true,
            zScoreThresh: -1,
            shadowSumThresh: options.shadowSum,
            cloudThresh: options.cloudThresh,
            dilatePixels: 4,
            cloudHeights: [200, 700, 1200, 1700, 2200, 2700, 3200, 3700, 4200, 4700],
            cloudBand: 'cloudScoreMask'
        });

        var collectionWithoutClouds = collectionWithMasks.map(function(image) {
            return image.mask(image.select(['cloudBQAMask', 'cloudScoreMask', 'shadowBQAMask', 'shadowTdomMask'])
                .reduce(ee.Reducer.anyNonZero()).eq(0));
        });
        return collectionWithoutClouds;
    };

    var processCollection = function(collectionid) {
        var spectralBands = ['blue', 'red', 'green', 'nir', 'swir1', 'swir2'];
        var objLandsat = {
            collectionid: collectionid,
            geometry: grid.geometry(),
            dateStart: options.dates.t0.slice(0, 4) + '-01-01',
            dateEnd: options.dates.t1.slice(0, 4) + '-12-31',
            cloudCover: options.cloudCover,
        };

        var bands = bns.get(options.bandIds[collectionid]);
        var collection = col.getCollection(objLandsat)
            .select(bands.bandNames, bands.newNames)
            .filter(ee.Filter.inList('system:index', options.blackList).not());

        collection = collection.map(scaleFactors);
        collection = applyCloudAndShadowMask(collection).select(spectralBands);

        // SMA fractions
        collection = collection.map(function(image) {
            return sma.getFractions(image, options.endmembers[options.collectionid]);
        });

        // SMA-derived indexes
        collection = collection
            .map(sma.getNDFI)
            .map(sma.getSEFI)
            .map(sma.getWEFI)
            .map(sma.getFNS);

        // Spectral indexes
        collection = collection
            .map(ind.getCAI)
            .map(ind.getEVI2)
            .map(ind.getGCVI)
            .map(ind.getHallCover)
            .map(ind.getHallHeigth)
            .map(ind.getNDVI)
            .map(ind.getNDWI)
            .map(ind.getPRI)
            .map(ind.getSAVI);

        return collection;
    };

    var makeCollection = function() {
        var collection = processCollection(options.collectionIds[options.collectionid][0]);
        if (options.collectionIds[options.collectionid].length == 2) {
            var collection2 = processCollection(options.collectionIds[options.collectionid][1]);
            collection = collection.merge(collection2);
        }
        return collection;
    };

    var coll = makeCollection();
    return coll.filterDate(options.dates.t0, options.dates.t1);
};

// Retrieve collections with and without blacklist
var collection_without_blacklist = getImages(param, [], grid);
var collection_with_blacklist = getImages(param, blackList, grid);

print('collection without blackList:', collection_without_blacklist);
print('collection with blackList:', collection_with_blacklist);

// Map visualization
Map.addLayer(grid.style({ color: 'FF000088' }), {}, 'Background');

Map.addLayer(
    collection_without_blacklist.median().clip(grid),
    { bands: 'swir1,nir,red', gain: '0.08,0.06,0.2' },
    'MOSAIC',
    true
);

Map.addLayer(
    collection_with_blacklist.median().clip(grid),
    { bands: 'swir1,nir,red', gain: '0.08,0.06,0.2' },
    'MOSAIC BLACK LIST',
    true
);

// List individual scenes (disabled by default)
collection_with_blacklist.reduceColumns(ee.Reducer.toList(), ['system:index'])
    .get('list')
    .evaluate(function(ids) {
        ids.forEach(function(imageid) {
            var image = collection_with_blacklist.filterMetadata('system:index', 'equals', imageid).mosaic();
            Map.addLayer(image,
                { bands: 'swir1,nir,red', gain: '0.08,0.06,0.2' },
                imageid,
                false
            );
            print(imageid);
        });
    });

// Landsat grid layer (for reference)
var landsatGrid = ee.FeatureCollection("projects/mapbiomas-bolivia/assets/AUXILIARY-DATA/VECTOR/grillas_landsat");
Map.addLayer(landsatGrid, {}, 'Landsat Grid', 0);

// Interactive panel to display PATH_ROW on click
var infoPanel = ui.Panel({ style: { position: 'bottom-left', padding: '8px' } });
Map.add(infoPanel);

Map.onClick(function(coords) {
    infoPanel.clear();
    var point = ee.Geometry.Point([coords.lon, coords.lat]);
    var selectedFeature = landsatGrid.filterBounds(point).first();
    selectedFeature.evaluate(function(feature) {
        if (feature) {
            infoPanel.add(ui.Label('Grid: ' + feature.properties.PATH_ROW));
        } else {
            infoPanel.add(ui.Label('No data for this point.'));
        }
    });
});