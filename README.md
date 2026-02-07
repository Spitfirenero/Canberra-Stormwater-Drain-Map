# Canberra Stormwater Drains (Leaflet viewer)

A lightweight, static web map for exploring stormwater drain lines around Canberra. The app renders a filtered GeoJSON dataset on top of switchable imagery basemaps, and supports optional “structures” (named groups + coordinate annotations) for faster navigation.

The site loads `filtered_data.geojson`, which is intentionally generated with a **≥ 0.6 m floor** so features under 0.6 m are **not** downloaded (the full dataset is too large for a simple static viewer).

## Features

- Leaflet-based viewer with diameter emphasis slider.
- Basemap selector (Esri imagery + optional ACTmapi imagery).
- Optional `structures.json` to define:
   - Structure membership (by asset id)
   - Coordinate annotations (e.g., entrances/vents)
   - Sidebar selection + zoom/highlight

## Run locally

Browsers block `fetch()` from `file://` pages, so you must serve the folder over HTTP.

From the repo root:

```bash
python -m http.server 8000
```

Open:

- http://localhost:8000/

## Regenerate `filtered_data.geojson`

This repo includes a small helper script that filters pipes by diameter (the source property is assumed to be millimetres).

Generate the default publishable dataset (recommended floor of 0.6 m):

```bash
py -3 .\filterGeoData.py --min-diameter-m 0.6
```

Generate an alternate output for experimentation:

```bash
py -3 .\filterGeoData.py --min-diameter-m 1.5 --output filtered_data_1p5m.geojson
```

The web UI slider adjusts emphasis within the downloaded dataset (≥ 0.6 m): features below the slider value are still drawn, but greyed out.

## Contributing

Contributions are welcome.

- Keep changes focused and avoid reformatting unrelated code.
- If you change data/schema assumptions (e.g., property names in GeoJSON), update both the app and `filterGeoData.py` usage notes.
- For UI changes, verify in a local server (see “Run locally”) and test at a few zoom levels (labels/annotations are zoom-gated).
- Please preserve on-page attribution for basemaps and datasets.

## Data and imagery attribution

- Stormwater drain linework: filtered subset derived from ACTmapi open data (see the in-app footer link).
- Imagery basemaps:
   - Esri World Imagery
   - ACTmapi imagery (higher resolution at close zoom, but can be less responsive)

## Credits

- Map rendering: Leaflet (https://leafletjs.com/)
- ACTmapi / ACT Government open data portal: https://actmapi-actgov.opendata.arcgis.com/
- Esri Leaflet (used for ImageServer-based ACTmapi imagery layers): https://esri.github.io/esri-leaflet/
- Favicon icon: https://freesvg.org/mountain-map-icon-vector-image
