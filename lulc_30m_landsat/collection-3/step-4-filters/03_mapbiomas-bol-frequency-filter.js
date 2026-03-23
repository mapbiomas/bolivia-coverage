/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var geometry = /* color: #d63000 */ee.Geometry.MultiPoint(),
    Mask_AOI = /* color: #d63000 */ee.FeatureCollection([]);
/***** End of imports. If edited, may not auto-convert in the playground. *****/
// Frequency‑based temporal filter for classification time series
// This script applies a majority frequency rule to reclassify pixels based on the
// most frequent native vegetation or land use class over the whole time series.

var param = {
    code_region: 21001,                      // Classification region ID
    pais: 'BOLIVIA',
    year: 2024,                               // Year for visualisation
    FF_naturales: {
        clasesNat: [11, 12, 13, 6, 3],        // Classes considered as native vegetation
        native_vegetation: 90,                 // Minimum % of native vegetation to apply filter
        perc_majority_nat: 50                  // Majority threshold for native classes
    },
    FF_usos: {
        clasesUso: [15, 18, 21],               // Classes considered as land use
        usos_cobertura: 60,                     // Minimum % of use classes to apply filter
        perc_majority_uso: 40                    // Majority threshold for use classes
    },
    version_input: 3,
    paso: 'CF',                                // 'CG' = general class asset; 'CF' = filtered asset
    version_output: 4,
    exportOpcion: {
        DriveFolder: 'DRIVE-EXPORT',
        exportClasifToDrive: false,
    },
    exclusion: {                                 // Classes or years to exclude from the filter
        clases: [],
        years: []
    },
    ExcluFirstLastYear: true                     // Exclude first and last years from continuity filter
};


var version_input = param.version_input;
var version_output = param.version_output;
var prefixo_out = param.pais + '-' + param.code_region + '-' + version_output + '-c3';
/*
 * NOTE: The asset paths below are examples from the original script.
 * You must replace them with your own Earth Engine asset paths, especially
 * the 'outputs' path where your classification results will be stored.
 * Ensure you have write permissions to the output folder.
 */
var paths = require('users/fantecnico3/mapbiomas-bolivia_col3:General/modules/directories.js').paths;
var assetClasif = paths.classificationRaisg;
var assetFiltros = paths.clasificacionFiltrosRaisg;
var dirout = paths.clasificacionFiltrosRaisg;
var AssetMosaic = paths.mosaics_c4_v1;

var assetC1 = 'projects/mapbiomas-bolivia/assets/LAND-COVER/COLLECTION-2/INTEGRATION/country-integration/BOLIVIA-5';
var Col1Sur = ee.Image(assetC1);

// Region of interest
var region = ee.FeatureCollection('projects/mapbiomas-bolivia/assets/AUXILIARY-DATA/VECTOR/clasificacion-regiones-7-b250m')
    .filterMetadata('id_regionc', 'equals', Number(param.code_region));

var setVersion = function(item) { return item.set('version', 1); };
var regionRaster = region
    .map(setVersion)
    .reduceToImage(['version'], ee.Reducer.first());

// Load mosaics for visualisation
var mosaicRegion = param.code_region.toString().slice(0, 3);
if (mosaicRegion === '211' || mosaicRegion === '205') { mosaicRegion = '210'; }
var mosaic = ee.ImageCollection(AssetMosaic)
    .filterMetadata('region_code', 'equals', Number(mosaicRegion));

var mosaic22 = ee.ImageCollection(paths.mosaics_c4_v2)
    .filterMetadata('region_code', 'equals', Number(mosaicRegion));
mosaic = mosaic.merge(mosaic22);

var mosaic24 = ee.ImageCollection(paths.mosaics_2024)
    .filter(ee.Filter.inList('country', ['BOLIVIA', 'BOLIVIA-AMAZONIA']));
mosaic = mosaic.merge(mosaic24);

// ---------------------------------------------------------------------
// Load input classification
// ---------------------------------------------------------------------
var Classif_Input;
if (param.paso === 'CG') {
    var assetPath = assetClasif + param.pais + '-' + param.code_region;
    Classif_Input = ee.Image(assetPath + '-' + version_input + '-c3');
} else {
    var assetPath = assetFiltros + param.pais + '-' + param.code_region;
    Classif_Input = ee.Image(assetPath + '-' + version_input + '-c3');
}
print('input', Classif_Input);

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
    bandNames.cat(Classif_Input.bandNames()).reduce(ee.Reducer.frequencyHistogram())
);

var bandsDictionary = bandsOccurrence.map(function(key, value) {
    return ee.Image(
        ee.Algorithms.If(
            ee.Number(value).eq(2),
            Classif_Input.select([key]).byte(),
            ee.Image(27).rename([key]).byte().updateMask(Classif_Input.select(0))
        )
    );
});

var imageAllBands = ee.Image(
    bandNames.iterate(function(band, img) {
        return ee.Image(img).addBands(bandsDictionary.get(ee.String(band)));
    }, ee.Image().select())
);

Classif_Input = imageAllBands.select(bandNames);
print(Classif_Input);

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
var vis = { bands: 'classification_' + param.year, min: 0, max: 76, palette: palette, format: 'png' };

// ---------------------------------------------------------------------
// Frequency filter function
// ---------------------------------------------------------------------
var filtrofreq = function(mapbiomas) {
    // Expression to compute percentage of years a pixel has a given class
    var exp = '100*((b(0)+b(1)+b(2)+b(3)+b(4)+b(5)+b(6)+b(7)+b(8)+b(9)+' +
        'b(10)+b(11)+b(12)+b(13)+b(14)+b(15)+b(16)+b(17)+b(18)+b(19)+' +
        'b(20)+b(21)+b(22)+b(23)+b(24)+b(25)+b(26)+b(27)+b(28)+b(29)+' +
        'b(30)+b(31)+b(32)+b(33)+b(34)+b(35)+b(36)+b(37)+b(38)+b(39))/40)';

    // --- Native vegetation classes ---
    var frequency = ee.Image(0);
    param.FF_naturales.clasesNat.forEach(function(clas) {
        var frecClas = mapbiomas.eq(clas).expression(exp).rename('class' + clas);
        frequency = frequency.addBands(frecClas);
    });

    // Mask where native vegetation frequency exceeds threshold
    var vegMask = frequency.reduce('sum');
    vegMask = ee.Image(0).where(vegMask.gte(param.FF_naturales.native_vegetation), 1);

    // Exclude pixels that ever had class 14 (land use) from the native mask
    var MaskUso = mapbiomas.eq(14).reduce('sum').gt(0);
    Map.addLayer(MaskUso, {}, 'MaskUso', false);
    vegMask = vegMask.where(MaskUso.eq(1), 0);
    Map.addLayer(vegMask, {}, 'vegMask', false);

    // Build the reclassified native image: assign the class that is majority
    var vegMap = frequency.reduce('sum').multiply(0); // start with zeros
    param.FF_naturales.clasesNat.forEach(function(clas) {
        vegMap = vegMap.where(
            vegMask.eq(1).and(frequency.select('class' + clas).gt(param.FF_naturales.perc_majority_nat)),
            clas
        );
    });

    // --- Land use classes (similar logic) ---
    var frequency2 = ee.Image(0);
    param.FF_usos.clasesUso.forEach(function(clas) {
        var frecClas = mapbiomas.eq(clas).expression(exp).rename('class' + clas);
        frequency2 = frequency2.addBands(frecClas);
    });

    var vegMask2 = frequency2.reduce('sum');
    vegMask2 = ee.Image(0).where(vegMask2.gt(param.FF_usos.usos_cobertura), 1);

    var vegMap2 = ee.Image(0);
    param.FF_usos.clasesUso.forEach(function(clas) {
        vegMap2 = vegMap2.where(
            vegMask2.eq(1).and(frequency2.select('class' + clas).gt(param.FF_usos.perc_majority_uso)),
            clas
        );
    });
    vegMap2 = vegMap2.updateMask(vegMap2.neq(0));

    print('vegMap', vegMap);

    // Apply the filter: replace pixels with the new native map (use map is commented out in original)
    var Clasif_Filtro_Frec_ = mapbiomas.where(vegMap, vegMap);
    // .where(vegMap2, vegMap2);  // originally commented, left as is

    return Clasif_Filtro_Frec_;
};

var Clasif_Filtro_Frec = filtrofreq(Classif_Input);
print('Clasif_Filtro_Frec', Clasif_Filtro_Frec);

Map.addLayer(Clasif_Filtro_Frec, {}, 'Clasif_Filtro_Frec');

var Class_Original = Classif_Input;
var Class_Filtrada = Clasif_Filtro_Frec;

// Apply an external AOI mask if present (Mask_AOI is expected to be a drawn polygon)
var temp;
print(Mask_AOI);
if (Mask_AOI.getInfo().features.length > 0) {
    temp = Clasif_Filtro_Frec.clip(Mask_AOI).selfMask();
    Clasif_Filtro_Frec = Class_Original.where(temp.gt(0), temp);
    print('Mask applied');
}

// ---------------------------------------------------------------------
// Identify pixels that have the same class in the first or last year
// and keep them unchanged (continuity filter)
// ---------------------------------------------------------------------
var class_col2 = Classif_Input;

// First year continuity
var FirstYear_Select = bandNames.iterate(function(bandName, previousImage) {
    var currentImage = class_col2.select(ee.String(bandName));
    previousImage = ee.Image(previousImage);
    currentImage = currentImage.eq(previousImage.select(0))
        .multiply(currentImage);
    return ee.Image(previousImage).addBands(currentImage);
}, ee.Image(class_col2.select([bandNames.get(0)])));

FirstYear_Select = ee.Image(FirstYear_Select).select(bandNames);

var t0 = 1985;
var t1 = 2024;

var FirstYearContinuityClass = function(year, previousImage2) {
    var currentImage = FirstYear_Select.select(ee.Number(year).subtract(t0));
    previousImage2 = ee.Image(previousImage2);
    var num = ee.Number(year).subtract(t0);
    currentImage = currentImage.where(previousImage2.select(num).eq(0), 0);
    return ee.Image(previousImage2).addBands(currentImage);
};

var firstYear = ee.Image(ee.List.sequence(t0, t1)
    .iterate(FirstYearContinuityClass, FirstYear_Select.select(0)))
    .select(bandNames);

// Last year continuity
var LastYear_Select = bandNames.iterate(function(bandName, previousImage) {
    var currentImage = class_col2.select(ee.String(bandName));
    previousImage = ee.Image(previousImage);
    currentImage = currentImage.eq(previousImage.select(0))
        .multiply(currentImage);
    return ee.Image(previousImage).addBands(currentImage);
}, ee.Image(class_col2.select([bandNames.get(36)])));

LastYear_Select = ee.Image(LastYear_Select).select(bandNames);
var LastYear_Select_rev = LastYear_Select.select(bandNames.reverse());

var LastYearContinuityClass = function(year, previousImage2) {
    var currentImage = LastYear_Select_rev.select(ee.Number(year).subtract(t0));
    previousImage2 = ee.Image(previousImage2);
    var num = ee.Number(year).subtract(t0);
    currentImage = currentImage.where(previousImage2.select(num).eq(0), 0);
    return ee.Image(previousImage2).addBands(currentImage);
};

var lastYear = ee.Image(ee.List.sequence(t0, t1)
    .iterate(LastYearContinuityClass, LastYear_Select_rev.select(0)))
    .select(bandNames);

var continuityFisrtLastYear = firstYear.selfMask().unmask(lastYear.selfMask());

if (param.ExcluFirstLastYear) {
    Clasif_Filtro_Frec = Clasif_Filtro_Frec.blend(continuityFisrtLastYear);
}

// ---------------------------------------------------------------------
// Apply exclusions (classes or years to keep unchanged)
// ---------------------------------------------------------------------
var Class_Original = Classif_Input;
var Class_Filtrada = Clasif_Filtro_Frec;

if (param.exclusion.clases.length > 0) {
    var clasifi = ee.List([]);
    param.exclusion.clases.forEach(function(clase) {
        var clasif_code = Class_Original.eq(clase).selfMask();
        clasifi = clasifi.add(Class_Original.updateMask(clasif_code).selfMask());
    });
    clasifi = ee.ImageCollection(clasifi).max();
    Map.addLayer(clasifi, {}, 'excluded_class', false);
    Class_Filtrada = Class_Filtrada.blend(clasifi);
    print('Classes excluded from temporal filter:', param.exclusion.clases);
}

if (param.exclusion.years.length > 0) {
    var yearExlud = Class_Original.select(bandNamesExclude);
    Class_Filtrada = Class_Filtrada.addBands(yearExlud, null, true);
    print('Years excluded from temporal filter:', param.exclusion.years);
}

Clasif_Filtro_Frec = Class_Filtrada.select(bandNames)
    .updateMask(regionRaster);

Clasif_Filtro_Frec = Clasif_Filtro_Frec
    .set('code_region', param.code_region)
    .set('pais', param.pais)
    .set('version', version_output)
    .set('descripcion', 'filtro frecuencia')
    .set('paso', 'P07')
    .int8();

print(Classif_Input);
print(Clasif_Filtro_Frec);

// ---------------------------------------------------------------------
// Visualisation
// ---------------------------------------------------------------------
mosaic = mosaic.filterMetadata('year', 'equals', param.year);
Map.addLayer(region, {}, 'region', false);
Map.addLayer(mosaic.mosaic().updateMask(regionRaster), {
    'bands': ['swir1_median', 'nir_median', 'red_median'],
    'gain': [0.08, 0.06, 0.02],
    'gamma': 0.65
}, 'mosaic-' + param.year, false);

Map.addLayer(Classif_Input, vis, 'image-' + param.year);
Map.addLayer(Clasif_Filtro_Frec, vis, 'filtered-' + param.year);

// ---------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------
Export.image.toAsset({
    'image': Clasif_Filtro_Frec,
    'description': prefixo_out,
    'assetId': dirout + prefixo_out,
    'pyramidingPolicy': { '.default': 'mode' },
    'region': region.geometry().bounds(),
    'scale': 30,
    'maxPixels': 1e13
});

if (param.exportOpcion.exportClasifToDrive) {
    Export.image.toDrive({
        image: Clasif_Filtro_Frec.toInt8(),
        description: prefixo_out + '-DRIVE-' + version_output,
        folder: param.exportOpcion.DriveFolder,
        scale: 30,
        maxPixels: 1e13,
        region: region.geometry().bounds()
    });
}

