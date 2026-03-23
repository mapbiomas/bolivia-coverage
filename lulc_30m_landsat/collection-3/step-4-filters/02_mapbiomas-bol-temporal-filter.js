/*
Temporal filter for classification time series
Applies a set of rules to smooth or fill class transitions over time.
*/
var param = {
    code_region: 20602,          // Classification region ID
    pais: 'BOLIVIA',
    year: [2000, 2021, 2022, 2023, 2024],   // Years for visualisation only
    version_input: 2,
    paso: 'CF',                   // 'CG' = general class asset; 'CF' = filtered asset
    version_output: 3,
    exportOpcion: {
        DriveFolder: 'DRIVE-EXPORT',
        exportClasifToDrive: false,
    },
    exclusion: {                   // Classes or years to exclude from the filter
        clases: [],
        years: []
    }
};


// --------------------- EXECUTION PRIORITY ORDER ---------------------
// Classes listed here will be processed in this order.
// First‑year filter (1985)
var ordem_exec_first = [3, 6, 12, 11, 13];
// Last‑year filter (2024)
var ordem_exec_last = [14];
// Middle years filters
var ordem_exec_middle = [33, 13, 4, 21, 3, 12, 25, 34, 15];
// --------------------------------------------------------------------
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
var AssetMosaic22 = paths.mosaics_c4_v2;


// Version numbers
var version_input = param.version_input;
var version_output = param.version_output;
var prefixo_out = param.pais + '-' + param.code_region + '-';

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
var vis = { min: 0, max: 76, palette: palette };

// Region of interest (vector and raster mask)
var regioes = ee.FeatureCollection('projects/mapbiomas-bolivia/assets/AUXILIARY-DATA/VECTOR/clasificacion-regiones-7-b250m')
    .filterMetadata("id_regionc", "equals", param.code_region);

var setVersion = function(item) { return item.set('version', 1); };
var regionRaster = regioes
    .map(setVersion)
    .reduceToImage(['version'], ee.Reducer.first());

// Load mosaics (including additional years 2022 and 2024)
var mosaicRegion = param.code_region.toString().slice(0, 3);
if (mosaicRegion == '211' || mosaicRegion == '205') { mosaicRegion = '210'; }

var mosaic = ee.ImageCollection(AssetMosaic);
var mosaic22 = ee.ImageCollection(AssetMosaic22)
    .filterMetadata('region_code', 'equals', Number(mosaicRegion));
mosaic = mosaic.merge(mosaic22);

var mosaic24 = ee.ImageCollection(paths.mosaics_2024)
    .filter(ee.Filter.inList('country', ['BOLIVIA', 'BOLIVIA-AMAZONIA']));
mosaic = mosaic.merge(mosaic24);

// Load the input classification image
var image_FE;
if (param.paso === 'CG') {
    var assetPath = assetClasif + '/' + param.pais + '-' + param.code_region;
    image_FE = ee.Image(assetPath + '-' + version_input + '-c3');
} else {
    var assetPath = assetFiltros + param.pais + '-' + param.code_region;
    image_FE = ee.Image(assetPath + '-' + version_input + '-c3');
}
print(image_FE);

// List of all years
var years = [
    1985, 1986, 1987, 1988, 1989, 1990, 1991, 1992, 1993, 1994,
    1995, 1996, 1997, 1998, 1999, 2000, 2001, 2002, 2003, 2004,
    2005, 2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014,
    2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024
];

// Band names for each year
var bandNames = ee.List(years.map(function(year) {
    return 'classification_' + String(year);
}));
var bandNamesExclude = ee.List(param.exclusion.years.map(function(year) {
    return 'classification_' + String(year);
}));

// Build a complete image with all bands (missing years become masked)
var bandsOccurrence = ee.Dictionary(
    bandNames.cat(image_FE.bandNames()).reduce(ee.Reducer.frequencyHistogram())
);

var bandsDictionary = bandsOccurrence.map(function(key, value) {
    return ee.Image(
        ee.Algorithms.If(
            ee.Number(value).eq(2),
            image_FE.select([key]).byte(),
            ee.Image().rename([key]).byte().updateMask(image_FE.select(0))
        )
    );
});

var imageAllBands = ee.Image(
    bandNames.iterate(function(band, img) {
        return ee.Image(img).addBands(bandsDictionary.get(ee.String(band)));
    }, ee.Image().select())
);
image_FE = imageAllBands;

// Replace masked pixels with class 27 (no data) within the region mask
var classif = ee.Image();
bandNames.getInfo().forEach(function(bandNames) {
    var image = image_FE.select(bandNames);
    var band0 = ee.Image(27).updateMask(regionRaster);
    band0 = band0.where(image.gte(0), image);
    classif = classif.addBands(band0.rename(bandNames));
});
image_FE = classif.select(bandNames);

// ---------------------------------------------------------------------
// Filtering functions for different temporal windows
// ---------------------------------------------------------------------

// Fill gaps of length 1 (pattern: X, Y, X → Y becomes X)
var mask3 = function(valor, ano, imagem) {
    var mask = imagem.select('classification_' + (parseInt(ano) - 1)).eq(valor)
        .and(imagem.select('classification_' + ano).neq(valor))
        .and(imagem.select('classification_' + (parseInt(ano) + 1)).eq(valor));
    var muda_img = imagem.select('classification_' + ano).mask(mask.eq(1)).where(mask.eq(1), valor);
    return imagem.select('classification_' + ano).blend(muda_img);
};

// Fill gaps of length 2 (pattern: X, Y, Y, X → both Y become X)
var mask4 = function(valor, ano, imagem) {
    var mask = imagem.select('classification_' + (parseInt(ano) - 1)).eq(valor)
        .and(imagem.select('classification_' + ano).neq(valor))
        .and(imagem.select('classification_' + (parseInt(ano) + 1)).neq(valor))
        .and(imagem.select('classification_' + (parseInt(ano) + 2)).eq(valor));
    var muda_img = imagem.select('classification_' + ano).mask(mask.eq(1)).where(mask.eq(1), valor);
    var muda_img1 = imagem.select('classification_' + (parseInt(ano) + 1)).mask(mask.eq(1)).where(mask.eq(1), valor);
    return imagem.select('classification_' + ano).blend(muda_img).blend(muda_img1);
};

// Fill gaps of length 3 (pattern: X, Y, Y, Y, X → all Y become X)
var mask5 = function(valor, ano, imagem) {
    var mask = imagem.select('classification_' + (parseInt(ano) - 1)).eq(valor)
        .and(imagem.select('classification_' + ano).neq(valor))
        .and(imagem.select('classification_' + (parseInt(ano) + 1)).neq(valor))
        .and(imagem.select('classification_' + (parseInt(ano) + 2)).neq(valor))
        .and(imagem.select('classification_' + (parseInt(ano) + 3)).eq(valor));
    var muda_img = imagem.select('classification_' + ano).mask(mask.eq(1)).where(mask.eq(1), valor);
    var muda_img1 = imagem.select('classification_' + (parseInt(ano) + 1)).mask(mask.eq(1)).where(mask.eq(1), valor);
    var muda_img2 = imagem.select('classification_' + (parseInt(ano) + 2)).mask(mask.eq(1)).where(mask.eq(1), valor);
    return imagem.select('classification_' + ano).blend(muda_img).blend(muda_img1).blend(muda_img2);
};

// Years applicable for each window size
var anos3 = ['1986', '1987', '1988', '1989', '1990', '1991', '1992', '1993', '1994', '1995', '1996', '1997', '1998', '1999', '2000', '2001', '2002', '2003', '2004', '2005', '2006', '2007', '2008', '2009', '2010', '2011', '2012', '2013', '2014', '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023'];
var anos4 = ['1986', '1987', '1988', '1989', '1990', '1991', '1992', '1993', '1994', '1995', '1996', '1997', '1998', '1999', '2000', '2001', '2002', '2003', '2004', '2005', '2006', '2007', '2008', '2009', '2010', '2011', '2012', '2013', '2014', '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022'];
var anos5 = ['1986', '1987', '1988', '1989', '1990', '1991', '1992', '1993', '1994', '1995', '1996', '1997', '1998', '1999', '2000', '2001', '2002', '2003', '2004', '2005', '2006', '2007', '2008', '2009', '2010', '2011', '2012', '2013', '2014', '2015', '2016', '2017', '2018', '2019', '2020', '2021'];

// Apply 5‑year window over all eligible years
var window5years = function(imagem, valor) {
    var img_out = imagem.select('classification_1985');
    for (var i_ano = 0; i_ano < anos5.length; i_ano++) {
        var ano = anos5[i_ano];
        img_out = img_out.addBands(mask5(valor, ano, imagem));
    }
    img_out = img_out.addBands(imagem.select('classification_2022'));
    img_out = img_out.addBands(imagem.select('classification_2023'));
    img_out = img_out.addBands(imagem.select('classification_2024'));
    return img_out;
};

// Apply 4‑year window over all eligible years
var window4years = function(imagem, valor) {
    var img_out = imagem.select('classification_1985');
    for (var i_ano = 0; i_ano < anos4.length; i_ano++) {
        var ano = anos4[i_ano];
        img_out = img_out.addBands(mask4(valor, ano, imagem));
    }
    img_out = img_out.addBands(imagem.select('classification_2023'));
    img_out = img_out.addBands(imagem.select('classification_2024'));
    return img_out;
};

// Apply 3‑year window over all eligible years
var window3years = function(imagem, valor) {
    var img_out = imagem.select('classification_1985');
    for (var i_ano = 0; i_ano < anos3.length; i_ano++) {
        var ano = anos3[i_ano];
        img_out = img_out.addBands(mask3(valor, ano, imagem));
    }
    img_out = img_out.addBands(imagem.select('classification_2024'));
    return img_out;
};

// Special filter for the first year (1985): if 1985 ≠ X but 1986 and 1987 = X, set 1985 = X
var mask3first = function(valor, imagem) {
    var mask = imagem.select('classification_1985').neq(valor)
        .and(imagem.select('classification_1986').eq(valor))
        .and(imagem.select('classification_1987').eq(valor));
    var muda_img = imagem.select('classification_1985').mask(mask.eq(1)).where(mask.eq(1), valor);
    var img_out = imagem.select('classification_1985').blend(muda_img);
    // Reattach all other bands unchanged
    for (var y = 1986; y <= 2024; y++) {
        img_out = img_out.addBands(imagem.select('classification_' + y));
    }
    return img_out;
};

// Special filter for the last year (2024): if 2024 ≠ X but 2022 and 2023 = X, set 2024 = X
var mask3last = function(valor, imagem) {
    var mask = imagem.select('classification_2022').eq(valor)
        .and(imagem.select('classification_2023').eq(valor))
        .and(imagem.select('classification_2024').neq(valor));
    var muda_img = imagem.select('classification_2024').mask(mask.eq(1)).where(mask.eq(1), valor);
    var img_out = imagem.select('classification_1985');
    for (var y = 1986; y <= 2023; y++) {
        img_out = img_out.addBands(imagem.select('classification_' + y));
    }
    img_out = img_out.addBands(imagem.select('classification_2024').blend(muda_img));
    return img_out;
};

// ---------------------------------------------------------------------
// Apply filters in the defined order
// ---------------------------------------------------------------------
var filtered = image_FE;

// First‑year filter
for (var i_class = 0; i_class < ordem_exec_first.length; i_class++) {
    var id_class = ordem_exec_first[i_class];
    filtered = mask3first(id_class, filtered);
}

// Last‑year filter
for (var i_class = 0; i_class < ordem_exec_last.length; i_class++) {
    var id_class = ordem_exec_last[i_class];
    filtered = mask3last(id_class, filtered);
}

// Middle‑years filters: apply 3‑year, then 4‑year, then 5‑year, then again 3‑year
for (var i_class = 0; i_class < ordem_exec_middle.length; i_class++) {
    var id_class = ordem_exec_middle[i_class];
    filtered = window3years(filtered, id_class);
}
for (var i_class = 0; i_class < ordem_exec_middle.length; i_class++) {
    var id_class = ordem_exec_middle[i_class];
    filtered = window4years(filtered, id_class);
    filtered = window5years(filtered, id_class);
}
for (var i_class = 0; i_class < ordem_exec_middle.length; i_class++) {
    var id_class = ordem_exec_middle[i_class];
    filtered = window3years(filtered, id_class);
}

// Remove class 0 (no data) mask
var classif = ee.Image();
bandNames.getInfo().forEach(function(bandNames) {
    var image = filtered.select(bandNames);
    var band0 = image.updateMask(image.unmask().gt(0));
    classif = classif.addBands(band0.rename(bandNames));
});
var classif_FT = classif.select(bandNames);

// Apply exclusion: keep original values for excluded classes
if (param.exclusion.clases.length > 0) {
    var clasifi = ee.List([]);
    param.exclusion.clases.forEach(function(clase) {
        var clasif_code = image_FE.eq(clase).selfMask();
        clasifi = clasifi.add(image_FE.updateMask(clasif_code).selfMask());
    });
    clasifi = ee.ImageCollection(clasifi).max();
    Map.addLayer(clasifi, {}, 'excluded_class');
    classif_FT = classif_FT.blend(clasifi);
    print('Classes excluded from temporal filter:', param.exclusion.clases);
}

// Apply exclusion: keep original values for excluded years
if (param.exclusion.years.length > 0) {
    var yearExlud = image_FE.select(bandNamesExclude);
    classif_FT = classif_FT.addBands(yearExlud, null, true);
    print('Years excluded from temporal filter:', param.exclusion.years);
}

filtered = classif_FT.select(bandNames).updateMask(regionRaster);

// ---------------------------------------------------------------------
// Visualisation
// ---------------------------------------------------------------------
for (var yearI = 0; yearI < param.year.length; yearI++) {
    var visYear = {
        'bands': 'classification_' + param.year[yearI],
        'min': 0,
        'max': 76,
        'palette': palette
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

    Map.addLayer(image_FE, visYear, 'original' + param.year[yearI], false);
    Map.addLayer(filtered, visYear, 'filtered' + param.year[yearI], false);
}

// Set metadata and print
filtered = filtered
    .set('code_region', param.code_region)
    .set('pais', param.pais)
    .set('version', version_output)
    .set('descripcion', 'filtro temporal')
    .set('paso', 'P07');

print(filtered);

// ---------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------
Export.image.toAsset({
    'image': filtered,
    'description': prefixo_out + version_output + '-c3',
    'assetId': dirout + prefixo_out + version_output + '-c3',
    'pyramidingPolicy': { '.default': 'mode' },
    'region': regioes.geometry().bounds(),
    'scale': 30,
    'maxPixels': 1e13
});

if (param.exportOpcion.exportClasifToDrive) {
    Export.image.toDrive({
        image: filtered.toInt8(),
        description: prefixo_out + 'DRIVE-' + version_output,
        folder: param.exportOpcion.DriveFolder,
        scale: 30,
        maxPixels: 1e13,
        region: regioes.geometry().bounds()
    });
}
