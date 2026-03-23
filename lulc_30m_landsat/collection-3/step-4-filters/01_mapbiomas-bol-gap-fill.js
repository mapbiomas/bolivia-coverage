// STEP P04: PRELIMINARY GAP-FILL CLASSIFICATION
// This script applies a temporal gap‑fill to classification images,
// ensuring that every pixel has a valid class for every year.
// It also exports the filled image and metadata, and optionally generates
// area statistics and comparison charts.

var param = {
    code_region: 21104,               // Classification region ID
    pais: 'BOLIVIA',
    year: [2022, 2023, 2024],          // Years for visualisation only
    version_input: 1,
    paso: 'CG',                        // 'CG' = general class asset; 'CF' = filtered asset
    version_output: 2,
    ExportOpcion: {
        DriveFolder: 'DRIVE-EXPORT',   // Folder for Drive exports
        exportClasifToDrive: false,    // Export classifications to Drive?
        exportEstadistica: false,       // Export area statistics?
    },
    exclusion: {                        // Classes or years to exclude from the filter
        clases: [],                     // List of classes to exclude in all years
        years: [],                      // List of years to exclude completely
    },
};


// Load required modules and asset paths
/*
 * NOTE: The asset paths below are examples from the original script.
 * You must replace them with your own Earth Engine asset paths, especially
 * the 'outputs' path where your classification results will be stored.
 * Ensure you have write permissions to the output folder.
 */
var paths = require('users/fantecnico3/mapbiomas-bolivia_col3:General/modules/directories.js').paths;
var assetCollection = paths.classification;//Exported classification
var assetOutput = paths.clasificacionFiltros;//Output export
var assetOutputMetadata = paths.filtrosMetadata;
var AssetMosaic = paths.mosaics_c4_v1;


// Full list of years
var years = [
    1985, 1986, 1987, 1988, 1989, 1990, 1991, 1992, 1993, 1994,
    1995, 1996, 1997, 1998, 1999, 2000, 2001, 2002, 2003, 2004,
    2005, 2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014,
    2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024
];

var palettes = require('users/mapbiomas/modules:Palettes.js');
var eePalettes = require('users/gena/packages:palettes');

// Region of interest (vector and raster mask)
var regions = ee.FeatureCollection('projects/mapbiomas-bolivia/assets/AUXILIARY-DATA/VECTOR/clasificacion-regiones-7-b250m')
    .filterMetadata('id_regionc', "equals", param.code_region);
var setVersion = function(item) { return item.set('version', 1); };
var regionRaster = regions
    .map(setVersion)
    .reduceToImage(['version'], ee.Reducer.first());

// Load mosaics (including additional years 2022 and 2024)
var mosaicRegion = param.code_region.toString().slice(0, 3);
if (mosaicRegion == '211' || mosaicRegion == '205') { mosaicRegion = '210'; }

var mosaic = ee.ImageCollection(AssetMosaic);
var mosaic22 = ee.ImageCollection(paths.mosaics_c4_v2)
    .filterMetadata('region_code', 'equals', Number(mosaicRegion));
mosaic = mosaic.merge(mosaic22);

var mosaic24 = ee.ImageCollection(paths.mosaics_2024)
    .filter(ee.Filter.inList('country', ['BOLIVIA', 'BOLIVIA-AMAZONIA']));
mosaic = mosaic.merge(mosaic24);

// -----------------------------------------------------------------------------
// Gap‑fill function (fills missing years by propagating nearest valid class)
// -----------------------------------------------------------------------------
var applyGapFill = function(image) {
    var bandNames = image.bandNames();

    // Forward fill (t0 → tn)
    var imageFilledt0tn = bandNames.slice(1)
        .iterate(function(bandName, previousImage) {
            var currentImage = image.select(ee.String(bandName));
            previousImage = ee.Image(previousImage);
            currentImage = currentImage.unmask(previousImage.select([0]));
            return currentImage.addBands(previousImage);
        }, ee.Image(image.select([bandNames.get(0)])));
    imageFilledt0tn = ee.Image(imageFilledt0tn);

    // Backward fill (tn → t0)
    var bandNamesReversed = bandNames.reverse();
    var imageFilledtnt0 = bandNamesReversed.slice(1)
        .iterate(function(bandName, previousImage) {
            var currentImage = imageFilledt0tn.select(ee.String(bandName));
            previousImage = ee.Image(previousImage);
            currentImage = currentImage.unmask(
                previousImage.select(previousImage.bandNames().length().subtract(1)));
            return previousImage.addBands(currentImage);
        }, ee.Image(imageFilledt0tn.select([bandNamesReversed.get(0)])));

    return ee.Image(imageFilledtnt0).select(bandNames);
};

// -----------------------------------------------------------------------------
// Load the input classification image
// -----------------------------------------------------------------------------
var version_input = param.version_input;
var version_output = param.version_output;

if (param.paso === 'CG') {
    var assetPath = assetCollection + param.pais + '-' + param.code_region;
    var image = ee.Image(assetPath + '-' + version_input + '-c3');
    print(assetPath + '-' + version_input);
} else {
    var assetPath = assetOutput + param.pais + '-' + param.code_region;
    var image = ee.Image(assetPath + '-' + version_input + '-c3');
    print('Classification', image);
}

// Merge with MapBiomas Collection 2 to add missing years (up to 2023) and add 2024
// Merge with MapBiomas Collection 2 to add missing years (up to 2023) and add 2024
// If you haven't classified the entire series, you can combine it with the previous collection to apply the filter to the whole series. 
// If you have classified the entire series, combining is not necessary.
var Mbcol2 = ee.Image('projects/mapbiomas-bolivia/assets/LAND-COVER/COLLECTION-2/INTEGRATION/country-integration/BOLIVIA-5');
var union = Mbcol2.addBands(image, ['classification_2024']).clip(regions);
image = union;

// -----------------------------------------------------------------------------
// Prepare band names and handle exclusions
// -----------------------------------------------------------------------------
var bandNames = ee.List(years.map(function(year) {
    return 'classification_' + String(year);
}));

var bandNamesExclude = ee.List(param.exclusion.years.map(function(year) {
    return 'classification_' + String(year);
}));

// Create a mask image for excluded years (all pixels set to 0, to be used later)
if (param.exclusion.years.length > 0) {
    var yearmaskExcl = ee.Image(0);
    param.exclusion.years.forEach(function(year) {
        yearmaskExcl = yearmaskExcl.addBands(ee.Image(0).rename('classification_' + String(year)));
    });
    yearmaskExcl = yearmaskExcl.slice(1).selfMask();
    print(yearmaskExcl);
}

// Remove class 27 pixels (no data) from the original image
var original = image;
if (param.exclusion.years.length > 0) {
    image = image.addBands(yearmaskExcl, null, true);
}
var classif = ee.Image();
var bandnameReg = image.bandNames();
bandnameReg.getInfo().forEach(function(bandName) {
    var imagey = image.select(bandName);
    var band0 = imagey.updateMask(imagey.unmask().neq(27));
    classif = classif.addBands(band0.rename(bandName));
});
image = classif.select(bandnameReg);

// Create a dictionary counting how many images contribute to each band
var bandsOccurrence = ee.Dictionary(
    bandNames.cat(image.bandNames()).reduce(ee.Reducer.frequencyHistogram())
);

// Build an image containing only the bands that exist (others are masked)
var bandsDictionary = bandsOccurrence.map(function(key, value) {
    return ee.Image(
        ee.Algorithms.If(
            ee.Number(value).eq(2),
            image.select([key]).byte(),
            ee.Image().rename([key]).byte().updateMask(image.select(0))
        )
    );
});

var imageAllBands = ee.Image(
    bandNames.iterate(function(band, img) {
        return ee.Image(img).addBands(bandsDictionary.get(ee.String(band)));
    }, ee.Image().select())
);

// Image containing the year value for each pixel (for metadata)
var imagePixelYear = ee.Image.constant(years)
    .updateMask(imageAllBands)
    .rename(bandNames);

// Apply the gap‑fill to both the class image and the year image
var imageFilledtnt0 = applyGapFill(imageAllBands);
var imageFilledYear = applyGapFill(imagePixelYear);

// -----------------------------------------------------------------------------
// Recreate the original image but with class 27 for missing bands
// -----------------------------------------------------------------------------
var bandsDictionaryTwo = bandsOccurrence.map(function(key, value) {
    return ee.Image(
        ee.Algorithms.If(
            ee.Number(value).eq(2),
            original.select([key]).byte(),
            ee.Image(27).rename([key]).byte().updateMask(image.select(0))
        )
    );
});

var imageAllBandsTwo = ee.Image(
    bandNames.iterate(function(band, img) {
        return ee.Image(img).addBands(bandsDictionaryTwo.get(ee.String(band)));
    }, ee.Image().select())
);

var Class_Original = imageAllBandsTwo;
var Class_Filtrada = imageFilledtnt0.select(bandNames);

// Apply exclusions: for classes to exclude, keep the original value
if (param.exclusion.clases.length > 0) {
    param.exclusion.clases.forEach(function(clase) {
        Class_Filtrada = Class_Filtrada.where(Class_Filtrada.eq(clase), Class_Original);
    });
    print('Classes excluded from temporal filter:', param.exclusion.clases);
}

// For years to exclude, replace the filtered bands with the original ones
if (param.exclusion.years.length > 0) {
    var yearExlud = original.select(bandNamesExclude);
    Class_Filtrada = Class_Filtrada.addBands(yearExlud, null, true);
    print('Years excluded from temporal filter:', param.exclusion.years);
}

imageFilledtnt0 = Class_Filtrada.select(bandNames);

// -----------------------------------------------------------------------------
// Export the gap‑filled classification and metadata
// -----------------------------------------------------------------------------
var imageName = param.pais + '-' + param.code_region + '-' + version_output + '-c3';
imageFilledtnt0 = imageFilledtnt0.select(bandNames)
    .set('code_region', param.code_region)
    .set('pais', param.pais)
    .set('version', version_output)
    .set('descripcion', 'gapfill')
    .set('paso', 'P09');

print('Gapfill Asset', imageFilledtnt0);

Export.image.toAsset({
    'image': imageFilledtnt0,
    'description': imageName,
    'assetId': assetOutput + imageName,
    'pyramidingPolicy': { '.default': 'mode' },
    'region': regions.geometry().bounds(),
    'scale': 30,
    'maxPixels': 1e13
});

var imageNameGapFill = param.pais + '-' + param.code_region + '-' + version_output + '-metadata';
imageFilledYear = imageFilledYear
    .set('code_region', param.code_region)
    .set('pais', param.pais)
    .set('version', version_output)
    .set('descripcion', 'gapfill metadata')
    .set('paso', 'P09');

print('Gapfill metadata', imageFilledYear);

Export.image.toAsset({
    'image': imageFilledYear,
    'description': imageNameGapFill,
    'assetId': assetOutputMetadata + imageNameGapFill,
    'pyramidingPolicy': { '.default': 'mode' },
    'region': regions.geometry().bounds(),
    'scale': 30,
    'maxPixels': 1e13
});

// Optional Drive export
if (param.ExportOpcion.exportClasifToDrive) {
    Export.image.toDrive({
        image: imageFilledtnt0.select(bandNames).toInt8(),
        description: imageName + '-DRIVE',
        folder: param.ExportOpcion.DriveFolder,
        scale: 30,
        maxPixels: 1e13,
        region: regions.geometry().bounds()
    });
}

// -----------------------------------------------------------------------------
// Visualisation layers
// -----------------------------------------------------------------------------
for (var yearI = 0; yearI < param.year.length; yearI++) {
    var vis = {
        'bands': ['classification_' + param.year[yearI]],
        'min': 0,
        'max': 34,
        'palette': palettes.get('classification2'),
        'format': 'png'
    };

    Map.addLayer(
        mosaic.filterMetadata('year', 'equals', param.year[yearI])
            .mosaic()
            .updateMask(regionRaster),
        {
            'bands': ['swir1_median', 'nir_median', 'red_median'],
            'gain': [0.08, 0.06, 0.08],
            'gamma': 0.65
        },
        'mosaic-' + param.year[yearI],
        false
    );

    Map.addLayer(original, vis, 'original classification ' + param.year[yearI], false);
    Map.addLayer(imageFilledtnt0.select(bandNames), vis, 'gap‑fill classification ' + param.year[yearI], false);
}

Map.addLayer(regions, {}, 'Region ' + param.code_region, false);

// -----------------------------------------------------------------------------
// Optional area statistics export (CSV)
// -----------------------------------------------------------------------------
function getAreas(image, region) {
    var pixelArea = ee.Image.pixelArea();
    var reducer = {
        reducer: ee.Reducer.sum(),
        geometry: region.geometry(),
        scale: 30,
        maxPixels: 1e13
    };
    var bandNames = image.bandNames();
    var classIds = ee.List.sequence(0, 34);

    bandNames.evaluate(function(bands, error) {
        if (error) print(error.message);
        var yearsAreas = [];

        bands.forEach(function(band) {
            var year = ee.String(band).split('_').get(1);
            var yearImage = image.select([band]);

            var covers = classIds.map(function(classId) {
                classId = ee.Number(classId).int8();
                var yearCoverImage = yearImage.eq(classId);
                var coverArea = yearCoverImage.multiply(pixelArea).divide(1e6);
                return coverArea.reduceRegion(reducer).get(band);
            }).add(year);

            var keys = classIds.map(function(item) {
                item = ee.Number(item).int8();
                var stringItem = ee.String(item);
                stringItem = ee.Algorithms.If(
                    item.lt(10),
                    ee.String('ID0').cat(stringItem),
                    ee.String('ID').cat(stringItem)
                );
                return ee.String(stringItem);
            }).add('year');

            var dict = ee.Dictionary.fromLists(keys, covers);
            yearsAreas.push(ee.Feature(null, dict));
        });

        yearsAreas = ee.FeatureCollection(yearsAreas);
        Export.table.toDrive({
            collection: yearsAreas,
            description: 'ESTADISTICAS-DE-COBERTURA',
            fileFormat: 'CSV',
            folder: 'P09-GapFill-CLASSIFICATION'
        });
    });
}

if (param.ExportOpcion.exportEstadistica) {
    getAreas(imageFilledtnt0.select(bandNames), regions);
}
