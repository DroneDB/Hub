/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Pure helper that builds the URLs to expose a dataset / folder / single entry
 * via the OGC services implemented by the Registry backend (WMS, WMTS, WFS,
 * WCS, OGC API Features, OGC API Tiles).
 *
 * Backend route scoping (see Registry.Web/Controllers/Ogc):
 *   /orgs/{org}/ds/{ds}/wms       (+ /wms/p/{*folder})
 *   /orgs/{org}/ds/{ds}/wfs       (+ /wfs/p/{*folder})
 *   /orgs/{org}/ds/{ds}/wcs       (+ /wcs/p/{*folder})
 *   /orgs/{org}/ds/{ds}/wmts      (+ /wmts/p/{*folder})
 *   /orgs/{org}/ds/{ds}/wmts/1.0.0/{layer}/{style}/{tms}/{z}/{y}/{x}.{ext}
 *   /orgs/{org}/ds/{ds}/ogcapi/...   (no folder route)
 *
 * Layer eligibility (see Registry.Web/Services/Adapters/OgcLayerCatalog.cs):
 * only GeoRaster and Vector entries are catalogued. WMS/WMTS expose both;
 * WCS exposes only rasters; WFS / OGC API Features only vectors.
 */

import ddb from 'ddb';

const TYPE = ddb.entry.type;

const NA_OGC_API_FOLDER =
    'OGC API endpoints are not available for folder scoping. ' +
    'Use the dataset-level URL instead.';

function isRaster(entry) { return entry && entry.type === TYPE.GEORASTER; }
function isVector(entry) { return entry && entry.type === TYPE.VECTOR; }
function isOgcEligibleEntry(entry) { return isRaster(entry) || isVector(entry); }

/** Encode a folder path segment-by-segment (preserves '/'). */
function encodeFolder(p) {
    return p.split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

/** Build the "base" URL up to (but excluding) the operation, e.g. ".../wms" or ".../wms/p/sub". */
function serviceBase(opts, svc) {
    const { baseUrl, org, ds, scope, folderPath } = opts;
    const root = `${baseUrl}/orgs/${encodeURIComponent(org)}/ds/${encodeURIComponent(ds)}`;
    if (scope === 'folder' && folderPath) {
        return `${root}/${svc}/p/${encodeFolder(folderPath)}`;
    }
    return `${root}/${svc}`;
}

function ogcApiBase(opts) {
    const { baseUrl, org, ds } = opts;
    return `${baseUrl}/orgs/${encodeURIComponent(org)}/ds/${encodeURIComponent(ds)}/ogcapi`;
}

/**
 * @param {object} opts
 * @param {string} opts.baseUrl         e.g. "https://hub.dronedb.app" (no trailing slash)
 * @param {string} opts.org             organization slug
 * @param {string} opts.ds              dataset slug
 * @param {'dataset'|'folder'|'entry'} opts.scope
 * @param {string} [opts.folderPath]    folder path (required when scope==='folder')
 * @param {object} [opts.entry]         ddb entry object (required when scope==='entry')
 * @returns {object} per-service descriptor
 */
export function buildOgcShareUrls(opts) {
    const { scope, entry } = opts;

    // Default per-service descriptor.
    const result = {
        wms: { capabilities: '', getMap: null, supported: false, reason: '' },
        wmts: { capabilities: '', restTileTemplate: null, supported: false, reason: '' },
        wfs: { capabilities: '', getFeature: null, supported: false, reason: '' },
        wcs: { capabilities: '', getCoverage: null, supported: false, reason: '' },
        ogcApiFeatures: { landing: '', collections: null, items: null, supported: false, reason: '' },
        ogcApiTiles: { landing: '', tilesets: null, supported: false, reason: '' }
    };

    let allowRaster, allowVector, layerName;
    if (scope === 'entry') {
        if (!entry || !isOgcEligibleEntry(entry)) {
            const reason = 'Only GeoRaster and Vector entries can be shared via OGC services.';
            Object.values(result).forEach(r => { r.reason = reason; });
            return result;
        }
        allowRaster = isRaster(entry);
        allowVector = isVector(entry);
        layerName = entry.path;
    } else {
        // dataset / folder: the backend filters by content; offer every service.
        // The user can introspect via GetCapabilities.
        allowRaster = true;
        allowVector = true;
        layerName = null;
    }

    const layerEnc = layerName != null ? encodeURIComponent(layerName) : null;

    // ---- WMS (raster + vector) -----------------------------------------------
    if (allowRaster || allowVector) {
        const base = serviceBase(opts, 'wms');
        result.wms.capabilities = `${base}?service=WMS&request=GetCapabilities&version=1.3.0`;
        result.wms.supported = true;
        if (layerEnc) {
            result.wms.getMap =
                `${base}?service=WMS&request=GetMap&version=1.3.0&LAYERS=${layerEnc}` +
                `&STYLES=&CRS=EPSG:3857&BBOX={minx},{miny},{maxx},{maxy}` +
                `&WIDTH=512&HEIGHT=512&FORMAT=image/png&TRANSPARENT=TRUE`;
        }
    }

    // ---- WMTS (raster + vector) ---------------------------------------------
    if (allowRaster || allowVector) {
        const base = serviceBase(opts, 'wmts');
        result.wmts.capabilities = `${base}?service=WMTS&request=GetCapabilities&version=1.0.0`;
        result.wmts.supported = true;
        if (layerEnc) {
            // Vector layers serve MVT (pbf); rasters serve png.
            const ext = allowVector && !allowRaster ? 'pbf' : (isVector(entry) ? 'pbf' : 'png');
            const { baseUrl, org, ds } = opts;
            const wmtsRoot = `${baseUrl}/orgs/${encodeURIComponent(org)}/ds/${encodeURIComponent(ds)}/wmts`;
            result.wmts.restTileTemplate =
                `${wmtsRoot}/1.0.0/${layerEnc}/default/WebMercatorQuad/{z}/{y}/{x}.${ext}`;
        }
    }

    // ---- WFS (vector only) ---------------------------------------------------
    if (allowVector) {
        const base = serviceBase(opts, 'wfs');
        result.wfs.capabilities = `${base}?service=WFS&request=GetCapabilities&version=2.0.0`;
        result.wfs.supported = true;
        if (layerEnc) {
            result.wfs.getFeature =
                `${base}?service=WFS&request=GetFeature&version=2.0.0` +
                `&TYPENAMES=${layerEnc}&count=100&outputFormat=application/json`;
        }
    } else if (scope === 'entry') {
        result.wfs.reason = 'WFS is only available for Vector entries.';
    }

    // ---- WCS (raster only) ---------------------------------------------------
    if (allowRaster) {
        const base = serviceBase(opts, 'wcs');
        result.wcs.capabilities = `${base}?service=WCS&request=GetCapabilities&version=2.0.1`;
        result.wcs.supported = true;
        if (layerEnc) {
            result.wcs.getCoverage =
                `${base}?service=WCS&request=GetCoverage&version=2.0.1` +
                `&CoverageId=${layerEnc}&FORMAT=image/tiff`;
        }
    } else if (scope === 'entry') {
        result.wcs.reason = 'WCS is only available for GeoRaster entries.';
    }

    // ---- OGC API (no folder route) ------------------------------------------
    if (scope === 'folder') {
        result.ogcApiFeatures.reason = NA_OGC_API_FOLDER;
        result.ogcApiTiles.reason = NA_OGC_API_FOLDER;
    } else {
        const apiRoot = ogcApiBase(opts);

        if (allowVector) {
            result.ogcApiFeatures.landing = apiRoot;
            result.ogcApiFeatures.collections = `${apiRoot}/collections`;
            result.ogcApiFeatures.supported = true;
            if (layerEnc) {
                result.ogcApiFeatures.items =
                    `${apiRoot}/collections/${layerEnc}/items?limit=100&f=json`;
            }
        } else if (scope === 'entry') {
            result.ogcApiFeatures.reason = 'OGC API Features is only available for Vector entries.';
        }

        if (allowRaster || allowVector) {
            result.ogcApiTiles.landing = apiRoot;
            result.ogcApiTiles.supported = true;
            if (layerEnc) {
                result.ogcApiTiles.tilesets = `${apiRoot}/collections/${layerEnc}/tiles`;
            }
        }
    }

    return result;
}

/** Stable label/order used by ShareEmbed for the OGC option group. */
export const OGC_SHARE_MODES = [
    { value: 'wms', label: 'WMS (Web Map Service)', service: 'wms' },
    { value: 'wmts', label: 'WMTS (Web Map Tile Service)', service: 'wmts' },
    { value: 'wfs', label: 'WFS (Web Feature Service)', service: 'wfs' },
    { value: 'wcs', label: 'WCS (Web Coverage Service)', service: 'wcs' },
    { value: 'ogcapiFeatures', label: 'OGC API Features', service: 'ogcApiFeatures' },
    { value: 'ogcapiTiles', label: 'OGC API Tiles', service: 'ogcApiTiles' }
];

/** Human-readable hint text for each service (used by OgcUsageHints dialog). */
export const OGC_USAGE_HINTS = {
    wms: {
        title: 'Web Map Service (WMS)',
        qgis: 'In QGIS: Layer → Add Layer → Add WMS/WMTS Layer → New → paste the URL into "URL" → Connect → pick a layer → Add.',
        arcgis: 'In ArcGIS Pro: Insert → Connections → Server → New WMS Server → paste the URL.',
        gdal: 'gdalinfo "WMS:<capabilities-url>"',
        notes: 'Returns rendered map images (PNG/JPEG). Good for visual overlays.'
    },
    wmts: {
        title: 'Web Map Tile Service (WMTS)',
        qgis: 'In QGIS: Layer → Add Layer → Add WMS/WMTS Layer (same dialog as WMS) → paste the capabilities URL.',
        arcgis: 'In ArcGIS Pro: Insert → Connections → Server → New WMTS Server → paste the capabilities URL.',
        gdal: 'gdalinfo "WMTS:<capabilities-url>"',
        notes: 'Pre-rendered tile pyramid. The RESTful tile URL template can be pasted into any XYZ tile client.'
    },
    wfs: {
        title: 'Web Feature Service (WFS)',
        qgis: 'In QGIS: Layer → Add Layer → Add WFS Layer → New → paste the URL → Connect → pick a feature type → Add.',
        arcgis: 'In ArcGIS Pro: Insert → Connections → Server → New WFS Server → paste the URL.',
        gdal: 'ogrinfo "WFS:<capabilities-url>"',
        notes: 'Returns vector features (GML / GeoJSON). Supports filtering and pagination.'
    },
    wcs: {
        title: 'Web Coverage Service (WCS)',
        qgis: 'In QGIS: Layer → Add Layer → Add WCS Layer → New → paste the URL → Connect → pick a coverage → Add.',
        arcgis: 'In ArcGIS Pro: Insert → Connections → Server → New WCS Server → paste the URL.',
        gdal: 'gdalinfo "WCS:<capabilities-url>"',
        notes: 'Returns raw raster coverages (GeoTIFF). Useful for analysis and download.'
    },
    ogcApiFeatures: {
        title: 'OGC API — Features',
        qgis: 'In QGIS 3.30+: Layer → Add Layer → Add OGC API Features Layer → paste the landing URL.',
        arcgis: 'Use the landing URL with any OGC API-compatible client.',
        gdal: 'ogrinfo "OAPIF:<landing-url>"',
        notes: 'Modern JSON-based REST API for vector features (GeoJSON).'
    },
    ogcApiTiles: {
        title: 'OGC API — Tiles',
        qgis: 'Use a recent QGIS build with OGC API Tiles support, or import via the tile set descriptor.',
        arcgis: 'Use the landing URL with any OGC API Tiles-compatible client.',
        gdal: '—',
        notes: 'Modern JSON-based REST API for tiled raster/vector content.'
    }
};
