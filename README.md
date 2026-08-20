![MapBiomas Bolivia](https://bolivia.mapbiomas.org/wp-content/uploads/sites/5/2026/08/logo_mapbiomas_Bolivia-1.png)

# 🌿 MapBiomas Bolivia – Land Cover Classification Scripts

This repository contains scripts for the classification and filtering of the Bolivian territory. The [**Appendix of the Algorithm Theoretical Basis Document (ATBD) for Bolivia**](https://bolivia.mapbiomas.org/wp-content/uploads/sites/15/2026/02/ATBD_General_MapBiomas_Bolivia_Col3_EN.pdf) is strongly recommended, as it details the conceptual framework, classification criteria, and methodology used for processing and analyzing geospatial information.

These scripts implement the official MapBiomas Bolivia methodology for **Collection 3** (1985–2024), using Landsat surface reflectance imagery (L5, L7, L8, L9) processed in Google Earth Engine.

---

## 📂 Repository Structure
```
collection-3/
├── modules/                                           # Reusable helper modules
│   ├── BandNames.js                                   # Band renaming across sensors
│   ├── Collection.js                                  # Collection filtering and preparation
│   ├── DataType.js                                    # Data type conversions
│   ├── Miscellaneous.js                               # Utility functions
│   ├── Mosaic.js                                      # Annual mosaic generation
│   ├── SmaAndNdfi.js                                  # Spectral Mixing Analysis (SMA) and NDFI
│   └── SpectralIndexes.js                             # Spectral indices (NDVI, EVI2, NDWI, etc.)
├── step-1-mosaics/                                    # Annual Landsat mosaic generation
│   └── 01-1-Black-List-Clasica-cloudTh...             # Black list
├── step-2-samples/                                    # Training sample collection
│   ├── 02-1-stable-pixels-reg                         # Stable pixel identification
│   ├── 02-2-class-area                                # Class area sampling
│   └── 02-3-training-points                           # Training point generation
├── step-3-classification/                             # Random Forest classification
│   ├── 03-1-Statics-box-analysis
│   └── 03-2-Classification
└── step-4-filters/                                    # Post-classification filters
    ├── 01_mapbiomas-bol-gap-fill.js
    ├── 02_mapbiomas-bol-temporal-filter.js
    ├── 03_mapbiomas-bol-frequency-filter.js
    └── 04_mapbiomas-bol-spatial-filter.js
```

## 🚀 Getting Started

### 1. Prerequisites
- A **Google Earth Engine** account ([sign up here](https://earthengine.google.com/)).
- Basic familiarity with the GEE Code Editor.

### 2. Set up the modules
The scripts rely on the modules inside the `modules/` folder. This repository already contains them, so **if you run the scripts directly from this public repository in Google Earth Engine (using the `require` paths as they are), no modifications are needed**.

However, if you **copy the scripts to your own Earth Engine account** (e.g., to adapt or extend them), you must:

1. **Update the `require` paths** in every script that imports modules.  
   For example, change this:
   ```javascript
   var bns = require('users/fantecnico3/mapbiomas-bolivia_col3:General/modules/BandNames.js');
   ```

   To this:
   ```javascript
   var bns = require('users/your_username/your_folder/modules/BandNames.js');
   ```
### 3. Adjust input/output paths as you progress through the workflow.
Each script is designed for a specific step (mosaics, samples, classification, filters). As you move from one step to the next, you will need to update paths to point to the correct input assets (e.g., stable pixels generated in step 02-1 become the input for step 02-2) and to your own output folders where you want to save intermediate and final results. Always verify that you have write permissions to the specified output locations.
