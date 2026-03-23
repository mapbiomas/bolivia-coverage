/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var geometry = /* color: #d63000 */ee.Geometry.MultiPoint();
/***** End of imports. If edited, may not auto-convert in the playground. *****/
// Spatial filter: removes small isolated patches and replaces them with the focal mode.

var param = { 
    code_region: 21001,                      // Classification region ID
    pais: 'BOLIVIA',
    eightConnected: true,                     // Use 8‑connectivity for patch detection
    year: 2024,                                // Year for visualisation
    version_input: 4,
    paso: 'CF',                                // 'CG' = general class asset; 'CF' = filtered asset
    version_output: 5,
    exportOpcion: {
        DriveFolder: 'DRIVE-EXPORT',
        exportClasifToDrive: false,
    },
    exclusion: {                                 // Classes or years to exclude from the filter
        clases: [],
        years: []
    },
    desactivaPiramide: false,                    // If true, disables pyramiding policy (used in visualisation)
};

var min_connect_pixel = 3;                       // Minimum number of connected pixels to keep a patch
/*
 * NOTE: The asset paths below are examples from the original script.
 * You must replace them with your own Earth Engine asset paths, especially
 * the 'outputs' path where your classification results will be stored.
 * Ensure you have write permissions to the output folder.
 */
var paths = require('users/fantecnico3/mapbiomas-bolivia_col3:General/modules/directories.js').paths;
var assetClasif = paths.classificationRaisg;
var assetFiltros = paths.clasificacionFiltrosRaisg;
var assetOutput = paths.clasificacionFiltros;
var dirout = paths.clasificacionFiltrosRaisg;
var AssetMosaic = paths.mosaics_c4_v1;

var assetC1 = 'projects/mapbiomas-bolivia/assets/LAND-COVER/COLLECTION-2/INTEGRATION/country-integration/BOLIVIA-5';
var Col1Sur = ee.Image(assetC1);

var version_input = param.version_input;
var version_output = param.version_output;
var prefixo_out = param.pais + '-' + param.code_region + '-' + version_output + '-c3';

// Region of interest
var region = ee.FeatureCollection('projects/mapbiomas-bolivia/assets/AUXILIARY-DATA/VECTOR/clasificacion-regiones-7-b250m')
    .filterMetadata("id_regionc", "equals", param.code_region);

var setVersion = function(item) { return item.set('version', 1); };
var regionRaster = region
    .map(setVersion)
    .reduceToImage(['version'], ee.Reducer.first());

// Load mosaics for visualisation
var mosaicRegion = param.code_region.toString().slice(0, 3);
if (mosaicRegion == '211' || mosaicRegion == '205') { mosaicRegion = '210'; }

var mosaic = ee.ImageCollection(AssetMosaic)
    .filterMetadata('region_code', 'equals', Number(mosaicRegion))
    .select(['swir1_median', 'nir_median', 'red_median']);

var mosaic22 = ee.ImageCollection(paths.mosaics_c4_v2)
    .filterMetadata('region_code', 'equals', Number(mosaicRegion))
    .select(['swir1_median', 'nir_median', 'red_median']);
mosaic = mosaic.merge(mosaic22);

var mosaic24 = ee.ImageCollection(paths.mosaics_2024)
    .filter(ee.Filter.inList('country', ['BOLIVIA', 'BOLIVIA-AMAZONIA']));
mosaic = mosaic.merge(mosaic24);

// Load the input classification image
var class4FT;
if (param.version_input == 1) {
    var assetPath = assetClasif + '/' + param.pais + '-' + param.code_region;
    class4FT = ee.Image(assetPath + '-' + version_input);
    if (param.version_input == 1) {   // redundant but kept as in original
        class4FT = ee.Image(assetPath + '-' + version_input + '-c3');
    }
} else {
    var assetPath = assetOutput + param.pais + '-' + param.code_region;
    class4FT = ee.Image(assetPath + '-' + version_input + '-c3');
}
print(class4FT);

// List of all years
var years = [
    1985, 1986, 1987, 1988, 1989, 1990, 1991, 1992, 1993, 1994,
    1995, 1996, 1997, 1998, 1999, 2000, 2001, 2002, 2003, 2004,
    2005, 2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014,
    2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024
];

var bandNames = ee.List(years.map(function(year) {
    return 'classification_' + String(year);
}));

var bandNamesExclude = ee.List(param.exclusion.years.map(function(year) {
    return 'classification_' + String(year);
}));

// Ensure all bands exist (missing bands are filled with class 27)
var bandsOccurrence = ee.Dictionary(
    bandNames.cat(class4FT.bandNames()).reduce(ee.Reducer.frequencyHistogram())
);

var bandsDictionary = bandsOccurrence.map(function(key, value) {
    return ee.Image(
        ee.Algorithms.If(
            ee.Number(value).eq(2),
            class4FT.select([key]).byte(),
            ee.Image(27).rename([key]).byte().updateMask(class4FT.select(0))
        )
    );
});

var imageAllBands = ee.Image(
    bandNames.iterate(function(band, img) {
        return ee.Image(img).addBands(bandsDictionary.get(ee.String(band)));
    }, ee.Image().select())
);
class4FT = imageAllBands;

// Add connected pixel count bands
var imageFilledConnected = class4FT.addBands(
    class4FT.connectedPixelCount(100, param.eightConnected)
        .rename(bandNames.map(function(band) {
            return ee.String(band).cat('_connected');
        }))
);
class4FT = imageFilledConnected;

// Colour palette for visualisation
var palette = [
    'ffffff', '129912', '1f4423', '006400', '00ff00', '687537', '76a5af',
    '29eee4', '77a605', '935132', 'bbfcac', '45c2a5', 'b8af4f', 'f1c232',
    'ffffb2', 'ffd966', 'f6b26b', 'f99f40', 'e974ed', 'd5a6bd', 'c27ba0',
    'fff3bf', 'ea9999', 'ffa07a', 'aa0000', 'ff99ff', '0000ff', '5c5c5c',
    'dd497f', 'ffaa5f', 'af2a2a', '8a2be2', '968c46', '0000ff', '4fd3ff',
    'dd497f', 'b2ae7c', 'af2a2a', '8a2be2', '968c46', '0000ff', '4fd3ff',
    'dd497f', 'b2ae7c', 'af2a2a', '8a2be2', '968c46', '0000ff', '4fd3ff',
    'dd497f', 'b2ae7c', 'af2a2a', '8a2be2', '968c46', '0000ff', '4fd3ff',
    'dd497f', 'b2ae7c', 'af2a2a', '8a2be2', '968c46', 'F5D5D5', '4fd3ff',
    'dd497f', 'b2ae7c', 'af2a2a', 'a89358', '968c46', 'e97a7a', '4fd3ff',
    'D3dc3d', 'b2ae7c', 'af2a2a', '8a2be2', '968c46', '0000ff', '4fd3ff'
];
var vis3 = {
    bands: 'classification_' + param.year,
    min: 0,
    max: 76,
    palette: palette,
    format: 'png'
};

// ---------------------------------------------------------------------
// Apply spatial filter year by year
// ---------------------------------------------------------------------

// First year (1985) separately
var ano = '1985';
var moda_85 = class4FT.select('classification_' + ano)
    .focal_mode(1, 'square', 'pixels');
moda_85 = moda_85.mask(class4FT.select('classification_' + ano + '_connected').lte(min_connect_pixel));
var class_outTotal = class4FT.select('classification_' + ano).blend(moda_85);

// Remaining years
var anos = ['1986','1987','1988','1989','1990','1991','1992','1993',
            '1994','1995','1996','1997','1998','1999','2000','2001',
            '2002','2003','2004','2005','2006','2007','2008','2009',
            '2010','2011','2012','2013','2014','2015','2016','2017',
            '2018','2019','2020','2021','2022','2023','2024'];

for (var i_ano = 0; i_ano < anos.length; i_ano++) {
    var ano = anos[i_ano];
    var moda = class4FT.select('classification_' + ano)
        .focal_mode(1, 'square', 'pixels');
    moda = moda.mask(class4FT.select('classification_' + ano + '_connected').lte(min_connect_pixel));
    var class_out = class4FT.select('classification_' + ano).blend(moda);
    class_outTotal = class_outTotal.addBands(class_out);
}

var classif_FS = class_outTotal.select(bandNames);

// ---------------------------------------------------------------------
// Apply exclusions (classes or years to keep unchanged)
// ---------------------------------------------------------------------
if (param.exclusion.clases.length > 0) {
    var clasifi = ee.List([]);
    var class4FT_orig = class4FT.select(bandNames);
    param.exclusion.clases.forEach(function(clase) {
        var clasif_code = class4FT_orig.eq(clase).selfMask();
        clasifi = clasifi.add(class4FT_orig.updateMask(clasif_code).selfMask());
    });
    clasifi = ee.ImageCollection(clasifi).max();
    Map.addLayer(clasifi, {}, 'excluded_class');
    classif_FS = classif_FS.blend(clasifi);
    print('Classes excluded from spatial filter:', param.exclusion.clases);
}

if (param.exclusion.years.length > 0) {
    var yearExlud = class4FT.select(bandNamesExclude);
    classif_FS = classif_FS.addBands(yearExlud, null, true);
    print('Years excluded from spatial filter:', param.exclusion.years);
}

class_outTotal = classif_FS.select(bandNames)
    .updateMask(regionRaster)
    .set('code_region', param.code_region)
    .set('pais', param.pais)
    .set('version', version_output)
    .set('descripcion', 'filtro espacial')
    .set('paso', 'P07');

print('Result', class_outTotal);

// ---------------------------------------------------------------------
// Visualisation (with optional reprojection if pyramid is disabled)
// ---------------------------------------------------------------------
if (param.piramideActive) {   // Note: this variable is not defined in param; kept as in original
    Map.addLayer(mosaic.filterMetadata('year', 'equals', param.year)
        .mosaic().updateMask(regionRaster), {
        'bands': ['swir1_median', 'nir_median', 'red_median'],
        'gain': [0.08, 0.06, 0.08],
        'gamma': 0.65
    }, 'mosaic-' + param.year, false);
    Map.addLayer(class4FT.select(bandNames), vis3, 'class-ORIGINAL' + param.year);
    Map.addLayer(class_outTotal, vis3, 'class-SPATIAL FILTER' + param.year);
} else {
    Map.addLayer(mosaic.filterMetadata('year', 'equals', param.year)
        .mosaic().updateMask(regionRaster), {
        'bands': ['swir1_median', 'nir_median', 'red_median'],
        'gain': [0.08, 0.06, 0.08],
        'gamma': 0.65
    }, 'mosaic-' + param.year, false);
    Map.addLayer(class4FT.select(bandNames).reproject('EPSG:4326', null, 30),
        vis3, 'class-ORIGINAL' + param.year);
    Map.addLayer(class_outTotal.reproject('EPSG:4326', null, 30),
        vis3, 'class-SPATIAL FILTER' + param.year);
}

// ---------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------
Export.image.toAsset({
    'image': class_outTotal,
    'description': prefixo_out,
    'assetId': dirout + prefixo_out,
    'pyramidingPolicy': { '.default': 'mode' },
    'region': region.geometry().bounds(),
    'scale': 30,
    'maxPixels': 1e13
});

if (param.exportOpcion.exportClasifToDrive) {
    Export.image.toDrive({
        image: class_outTotal.toInt8(),
        description: prefixo_out + '-DRIVE',
        folder: param.exportOpcion.DriveFolder,
        scale: 30,
        maxPixels: 1e13,
        region: region.geometry().bounds()
    });
}

