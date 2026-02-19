# Hyperspectral & Multispectral Data API Research

Research into APIs for integrating hyperspectral/multispectral satellite data into SoilTrack's fields and trial plots at different resolutions.

## Quick Comparison

| Provider | Type | Bands | Spatial Res | Revisit | Cost | Plot Suitability |
|---|---|---|---|---|---|---|
| Sentinel-2 | Multispectral | 13 | 10-20m | 5-day | Free | Field-level |
| Wyvern Open Data | Hyperspectral | 23-32 | 5.3m | ~2-day | Free (CC BY 4.0) | Good |
| Planet SuperDove | Multispectral | 8 | 3m | Daily | ~$1.80/km2 | Excellent |
| Satellogic MS | Multispectral | 5 | 0.7m | 8x/day | Published pricing | Excellent |
| Pixxel Firefly | Hyperspectral | 150+ | 5m | Daily | Per km2 (contact) | Very Good |
| Wyvern Dragonette | Hyperspectral | 23-32 | 5.3m | ~2-day | Contact sales | Good |
| Planet Tanager | Hyperspectral | 400+ | 30m | Tasking | Enterprise | Poor (coarse) |
| Satellogic HSI | Hyperspectral | 32 | 25m | 8x/day | Published pricing | Moderate |
| NASA EMIT | Hyperspectral | 285 | 60m | Irregular | Free | Poor (coarse) |
| PRISMA | Hyperspectral | ~250 | 30m | ~29-day | Free (research) | Poor (coarse) |
| EnMAP | Hyperspectral | 224-242 | 30m | 4-day | Free (research) | Poor (coarse) |

---

## Tier 1: Free Baseline

### Sentinel-2 (Copernicus Data Space Ecosystem)

- **Data type:** 13-band multispectral (VNIR + SWIR)
- **Key bands at 10m:** Blue (490nm), Green (560nm), Red (665nm), NIR (842nm)
- **Key bands at 20m:** 3x Red-Edge (705, 740, 783nm), Narrow NIR (865nm), SWIR (1610nm, 2190nm)
- **Temporal resolution:** 5-day revisit (2-3 days at mid-latitudes)
- **API access:** STAC API, OData, Sentinel Hub, Google Earth Engine, Microsoft Planetary Computer
- **Cost:** Completely free, open data policy
- **Pros:** Excellent spectral coverage (red-edge + SWIR), long archive since 2015, multiple API access paths, analysis-ready L2A surface reflectance
- **Cons:** 10-20m too coarse for small trial plots (<1 ha), 5-day revisit may miss events, cloud cover reduces usable observations

### Wyvern Open Data Program

- **Data type:** 23-32 band hyperspectral (445-880nm VNIR)
- **Spatial resolution:** 5.3m
- **Temporal resolution:** ~2-day revisit
- **API access:** STAC-compliant data catalogue, UP42 marketplace
- **Cost:** Free under CC BY 4.0 licence
- **Pros:** Free hyperspectral data for prototyping, 5.3m suitable for trial plots, STAC-compliant
- **Cons:** VNIR only (no SWIR), 23-32 bands is limited, small constellation (3-6 satellites)
- **Link:** https://wyvern.space/wyvern-open-data-program-access-hyperspectral-data-in-seconds/

### NASA EMIT (ISS-mounted)

- **Data type:** 285 bands, 381-2493nm (full VNIR+SWIR), ~7.5nm spectral resolution
- **Spatial resolution:** 60m
- **API access:** NASA Earthdata CMR API, `earthaccess` Python library
- **Cost:** Free (NASA open data)
- **Cons:** 60m too coarse for plots, irregular coverage (ISS orbit)

### PRISMA (Italian Space Agency)

- **Data type:** ~250 bands, 400-2500nm (VNIR+SWIR) + 5m panchromatic
- **Spatial resolution:** 30m hyperspectral
- **API access:** PRISMA Portal (registration required)
- **Cost:** Free for research
- **Cons:** 30m too coarse, ~29-day revisit, narrow 30km swath

### EnMAP (German Space Agency)

- **Data type:** 224-242 bands, 420-2450nm (VNIR+SWIR), 6.5-10nm spectral resolution
- **Spatial resolution:** 30m
- **API access:** EOWEB GeoPortal (free registration for research)
- **Cost:** Free for research
- **Cons:** 30m too coarse, 30km swath, tasking-based

---

## Tier 2: Paid Multispectral (Plot-Level Detail)

### Planet SuperDove (Recommended first paid step)

- **Data type:** 8-band multispectral
- **Bands:** Coastal Blue (431-452nm), Blue (465-515nm), Green I (513-549nm), Green II (547-583nm), Yellow (600-620nm), Red (650-680nm), Red-Edge (697-713nm), NIR (845-885nm)
- **Spatial resolution:** 3m
- **Temporal resolution:** Daily (entire landmass)
- **API access:** REST API, Sentinel Hub integration, Python SDK, self-service platform
- **Cost:** Archive ~$1.80/km2 (min 250 km2 via resellers). Subscriptions $5,000-$250,000/yr. 30-day free trial available.
- **Pros:** Daily 3m with red-edge is exceptional for trial monitoring, harmonised with Sentinel-2, deep archive back to 2019, well-documented API
- **Cons:** No SWIR bands, costs add up for large areas
- **Link:** https://www.planet.com/products/

### Satellogic (Sub-Meter Resolution)

- **Data type:** 5-band multispectral at 0.7m + 32-band hyperspectral at 25m
- **Temporal resolution:** Up to 8 revisits/day (50+ satellites)
- **API access:** Aleph self-service platform, UP42 marketplace
- **Cost:** Published pricing on website (rare transparency)
- **Pros:** 0.7m resolves individual plant rows, transparent pricing
- **Cons:** Hyperspectral is VNIR-only (483-831nm), 25m too coarse for HSI plot work
- **Link:** https://developers.satellogic.com/

---

## Tier 3: Paid Hyperspectral (Soil/Crop Chemistry)

### Pixxel Firefly (Best Fit for SoilTrack)

- **Data type:** 150+ band hyperspectral (470-900nm VNIR)
- **Spatial resolution:** 5m (highest commercial hyperspectral available)
- **Temporal resolution:** Daily with 6 Firefly satellites
- **API access:** Aurora platform (browser-based + API), SkyFi, UP42
- **Cost:** Per km2 pricing (contact sales)
- **Pros:** 5m resolves trial plots, 150+ bands for subtle crop stress/nutrient detection, partnership with DataFarming (40% of Australian grain farms), Aurora no-code platform, NASA CSDA validated
- **Cons:** VNIR only until Honeybee (2026, adds SWIR), limited archive (since Jan 2025), pricing requires sales contact
- **Upcoming:** Honeybee constellation (2026) adds 250+ bands with SWIR (470-2500nm)
- **Link:** https://www.pixxel.space/hyperspectral-imagery

### Wyvern Dragonette (Budget Alternative)

- **Data type:** 23-32 band hyperspectral (445-880nm VNIR)
- **Spatial resolution:** 5.3m
- **Temporal resolution:** ~2-day revisit
- **API access:** STAC-compliant catalogue, UP42, Geopera
- **Cost:** Commercial licensing (contact sales); free Open Data Program for prototyping
- **Pros:** Free data for prototyping, STAC-compliant, budget-friendly
- **Cons:** Only 23-32 bands, VNIR only, small constellation
- **Link:** https://wyvern.space/our-products/

---

## Aggregation Platforms

### Google Earth Engine
- 90+ PB catalogue (Sentinel-2, Landsat, MODIS, NAIP, etc.)
- Server-side computation, Python/JS APIs
- Free for noncommercial/academic use; commercial use paid
- Best for time-series analysis combining multiple datasets

### Microsoft Planetary Computer
- STAC API access to Sentinel-2, Landsat, HLS, SoilGrids, CHIRPS
- Free data access, Azure compute costs for processing
- STAC-compliant, works with Python ecosystem (pystac, xarray)

### UP42 (Marketplace)
- Single API to access Pixxel, Wyvern, Satellogic, Planet, Airbus
- No long-term commitment, per-order pricing
- Good for comparing data sources without individual contracts

---

## SoilTrack Integration Architecture

### Existing hooks in the codebase

1. **GIS layer system** -- `TrialMap` auto-discovers numeric attributes from uploaded shapefiles via `discoverGISNumericColumns()`. Spectral indices from external processing can already be loaded via shapefile/CSV upload.
2. **CSV custom data layers** -- Users can upload any CSV with lat/lon + numeric columns to the trial map. This works today for externally computed spectral indices.
3. **IDW interpolation overlay** -- Canvas-based heatmap for any numeric metric. Directly applicable to spectral index data.
4. **Field boundaries** -- Stored as GeoJSON in `fields.boundary`. Can be used to clip satellite imagery AOIs.

### Recommended integration approach

1. **Use STAC API as the standard interface** -- Supported by Copernicus, Planetary Computer, Wyvern, and UP42. Allows swapping data sources with minimal code changes.
2. **Start with free Sentinel-2** data to build the integration pipeline.
3. **Use Planet SuperDove's free trial** to validate plot-level resolution requirements.
4. **Add Pixxel/Wyvern** for production hyperspectral when budget allows.
5. **New API route** would fetch raster tiles or pre-computed indices, clip to field boundaries, and surface them as map layers in `FieldMap`/`TrialMap`.

### Key npm packages for integration

- `stac-js` or direct STAC API calls -- catalogue search and asset access
- `geotiff` / `geotiff.js` -- client-side GeoTIFF rendering
- `proj4` -- coordinate transformations
- `turf.js` -- spatial operations (clip to boundary, area calculations)

---

## Upcoming Missions to Watch

| Mission | Agency | Launch | Resolution | Bands | Notes |
|---|---|---|---|---|---|
| CHIME | ESA/Copernicus | ~2029 | 30m | 200+ (400-2500nm) | Free Copernicus hyperspectral |
| SBG | NASA | ~2028 | 30m | VNIR+SWIR+TIR | Surface Biology & Geology |
| Pixxel Honeybee | Pixxel | 2026 | 5m | 250+ (VNIR+SWIR) | Full-spectrum commercial HS |

---

## Recommendation

**Cost-effective path from $0 to production hyperspectral:**

1. **Now:** Sentinel-2 (free, field-level) + Wyvern Open Data (free, plot-level hyperspectral prototype)
2. **Next:** Planet SuperDove (30-day free trial, then ~$5k/yr for daily 3m multispectral)
3. **When ready:** Pixxel Firefly (5m, 150+ band hyperspectral, per km2 pricing)

This approach lets you build and validate the integration pipeline at zero cost, then scale resolution and spectral detail incrementally.
