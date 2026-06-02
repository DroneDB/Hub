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
 *
 * Client URL guidance:
 * - serviceUrl / landing is the connection URL to paste into most desktop GIS clients.
 * - capabilities is useful for browser inspection and clients that explicitly ask for
 *   a GetCapabilities document.
 */

import ddb from 'ddb';

const TYPE = ddb.entry.type;

const NA_OGC_API_FOLDER =
    'OGC API endpoints are not available for folder scoping. ' +
    'Use the dataset-level URL instead.';

function isRaster(entry) {
    return entry && entry.type === TYPE.GEORASTER;
}

function isVector(entry) {
    return entry && entry.type === TYPE.VECTOR;
}

function isOgcEligibleEntry(entry) {
    return isRaster(entry) || isVector(entry);
}

/** Remove trailing slash from a base URL so URL concatenation is stable. */
function normalizeBaseUrl(baseUrl) {
    return String(baseUrl || '').replace(/\/+$/, '');
}

/** Encode a folder path segment-by-segment, preserving '/'. */
function encodeFolder(p) {
    return String(p || '')
        .split('/')
        .filter(Boolean)
        .map(encodeURIComponent)
        .join('/');
}

/** Build the dataset root URL. */
function datasetRoot(opts) {
    const { org, ds } = opts;
    const baseUrl = normalizeBaseUrl(opts.baseUrl);

    return `${baseUrl}/orgs/${encodeURIComponent(org)}/ds/${encodeURIComponent(ds)}`;
}

/** Build the service URL, e.g. ".../wms" or ".../wms/p/subfolder". */
function serviceBase(opts, svc) {
    const { scope, folderPath } = opts;
    const root = datasetRoot(opts);

    if (scope === 'folder' && folderPath) {
        return `${root}/${svc}/p/${encodeFolder(folderPath)}`;
    }

    return `${root}/${svc}`;
}

/** Build the OGC API landing URL. OGC API folder routes are not supported. */
function ogcApiBase(opts) {
    return `${datasetRoot(opts)}/ogcapi`;
}

/**
 * @param {object} opts
 * @param {string} opts.baseUrl         e.g. "https://hub.dronedb.app"
 * @param {string} opts.org             organization slug
 * @param {string} opts.ds              dataset slug
 * @param {'dataset'|'folder'|'entry'} opts.scope
 * @param {string} [opts.folderPath]    folder path, required when scope === 'folder'
 * @param {object} [opts.entry]         ddb entry object, required when scope === 'entry'
 * @returns {object} per-service descriptor
 */
export function buildOgcShareUrls(opts) {
    const { scope, entry } = opts;

    const result = {
        wms: {
            serviceUrl: '',
            capabilities: '',
            getMap: null,
            supported: false,
            reason: ''
        },
        wmts: {
            serviceUrl: '',
            capabilities: '',
            restTileTemplate: null,
            supported: false,
            reason: ''
        },
        wfs: {
            serviceUrl: '',
            capabilities: '',
            getFeature: null,
            supported: false,
            reason: ''
        },
        wcs: {
            serviceUrl: '',
            capabilities: '',
            getCoverage: null,
            supported: false,
            reason: ''
        },
        ogcApiFeatures: {
            landing: '',
            collections: null,
            items: null,
            supported: false,
            reason: ''
        },
        ogcApiTiles: {
            landing: '',
            tilesets: null,
            supported: false,
            reason: ''
        }
    };

    let allowRaster;
    let allowVector;
    let layerName;

    if (scope === 'entry') {
        if (!entry || !isOgcEligibleEntry(entry)) {
            const reason = 'Only GeoRaster and Vector entries can be shared via OGC services.';
            Object.values(result).forEach(r => {
                r.reason = reason;
            });
            return result;
        }

        allowRaster = isRaster(entry);
        allowVector = isVector(entry);
        layerName = entry.path;
    } else {
        // dataset / folder: the backend filters by content; offer every service.
        // Users can introspect available layers through GetCapabilities / collections.
        allowRaster = true;
        allowVector = true;
        layerName = null;
    }

    const layerEnc = layerName != null ? encodeURIComponent(layerName) : null;

    // ---- WMS: raster + vector, rendered map images ----------------------------
    if (allowRaster || allowVector) {
        const base = serviceBase(opts, 'wms');

        result.wms.serviceUrl = base;
        result.wms.capabilities = `${base}?service=WMS&request=GetCapabilities&version=1.3.0`;
        result.wms.supported = true;

        if (layerEnc) {
            result.wms.getMap =
                `${base}?service=WMS&request=GetMap&version=1.3.0&LAYERS=${layerEnc}` +
                `&STYLES=&CRS=EPSG:3857&BBOX={minx},{miny},{maxx},{maxy}` +
                `&WIDTH=512&HEIGHT=512&FORMAT=image/png&TRANSPARENT=TRUE`;
        }
    }

    // ---- WMTS: raster/image tiles and, when supported by clients, vector tiles -
    if (allowRaster || allowVector) {
        const base = serviceBase(opts, 'wmts');

        result.wmts.serviceUrl = base;
        result.wmts.capabilities = `${base}?service=WMTS&request=GetCapabilities&version=1.0.0`;
        result.wmts.supported = true;

        if (layerEnc) {
            // Vector layers serve MVT/PBF; raster layers serve PNG.
            const ext = allowVector && !allowRaster ? 'pbf' : 'png';
            const wmtsRoot = `${datasetRoot(opts)}/wmts`;

            result.wmts.restTileTemplate =
                `${wmtsRoot}/1.0.0/${layerEnc}/default/WebMercatorQuad/{z}/{y}/{x}.${ext}`;
        }
    }

    // ---- WFS: vector only -----------------------------------------------------
    if (allowVector) {
        const base = serviceBase(opts, 'wfs');

        result.wfs.serviceUrl = base;
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

    // ---- WCS: raster only -----------------------------------------------------
    if (allowRaster) {
        const base = serviceBase(opts, 'wcs');

        result.wcs.serviceUrl = base;
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

    // ---- OGC API: no folder route --------------------------------------------
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
            result.ogcApiFeatures.reason =
                'OGC API Features is only available for Vector entries.';
        }

        if (allowRaster || allowVector) {
            result.ogcApiTiles.landing = apiRoot;
            result.ogcApiTiles.supported = true;

            if (layerEnc) {
                result.ogcApiTiles.tilesets =
                    `${apiRoot}/collections/${layerEnc}/tiles`;
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

/** Human-readable hint text for each service, used by OgcUsageHints dialog. */
export const OGC_USAGE_HINTS = {
    wms: {
        title: 'Web Map Service (WMS)',
        qgis:
            'In QGIS: Layer → Add Layer → Add WMS/WMTS Layer → New → paste the WMS service URL, preferably without request=GetCapabilities/version parameters → Connect → pick a layer → Add.',
        arcgis:
            'In ArcGIS Pro: Insert → Connections → Server → New WMS Server → paste the WMS service URL.',
        gdal:
            'gdalinfo "WMS:<service-url>"',
        notes:
            'Returns rendered map images, typically PNG/JPEG. Good for visual overlays.'
    },

    wmts: {
        title: 'Web Map Tile Service (WMTS)',
        qgis:
            'In QGIS: Layer → Add Layer → Add WMS/WMTS Layer → New → paste the WMTS service URL or WMTS GetCapabilities URL → Connect → pick a layer → Add. For .pbf vector tiles, use a Vector Tile Layer with the tile URL template instead.',
        arcgis:
            'In ArcGIS Pro: Insert → Connections → Server → New WMTS Server → paste the WMTS service URL. WMTS support is primarily for cached map/image tiles.',
        gdal:
            'gdalinfo "WMTS:<capabilities-url>"',
        notes:
            'Pre-rendered tile pyramid. Raster/image WMTS is broadly supported; vector .pbf tiles may require a vector-tile client rather than the WMS/WMTS dialog.'
    },

    wfs: {
        title: 'Web Feature Service (WFS)',
        qgis:
            'In QGIS: Layer → Add Layer → Add WFS / OGC API Features Layer → New → paste the WFS service URL → Connect → pick a feature type → Add.',
        arcgis:
            'In ArcGIS Pro: Insert → Connections → Server → New WFS Server → paste the WFS service URL.',
        gdal:
            'ogrinfo "WFS:<service-url>"',
        notes:
            'Returns vector features, usually GML; GeoJSON is available when the server advertises/supports it. Supports filtering and pagination depending on server capabilities.'
    },

    wcs: {
        title: 'Web Coverage Service (WCS)',
        qgis:
            'In QGIS: Layer → Add Layer → Add WCS Layer → New → paste the WCS service URL, preferably without request=GetCapabilities/version parameters → Connect → pick a coverage → Add.',
        arcgis:
            'In ArcGIS Pro: Insert → Connections → Server → New WCS Server → paste the WCS service URL.',
        gdal:
            'gdalinfo "WCS:<service-url>"',
        notes:
            'Returns raw raster coverages, commonly GeoTIFF when advertised by the server. Useful for analysis and download.'
    },

    ogcApiFeatures: {
        title: 'OGC API - Features',
        qgis:
            'In QGIS: Layer → Add Layer → Add WFS / OGC API Features Layer → New → paste the OGC API landing URL → Connect → pick a collection → Add.',
        arcgis:
            'In ArcGIS Pro: Insert → Connections → Server → New OGC API Server → paste the OGC API landing URL → add an OGC API Features layer.',
        gdal:
            'ogrinfo "OAPIF:<landing-url>"',
        notes:
            'Modern JSON/GeoJSON REST API for vector features.'
    },

    ogcApiTiles: {
        title: 'OGC API - Tiles',
        qgis:
            'For raster/map tiles, use a client path supported by your QGIS build, or use WMTS/XYZ where available. For .pbf vector tiles, use Layer → Add Layer → Add Vector Tile Layer with the tile URL template.',
        arcgis:
            'In ArcGIS Pro: Insert → Connections → Server → New OGC API Server → paste the OGC API landing URL. ArcGIS Pro supports OGC API Tiles for map tiles.',
        gdal:
            'gdalinfo "OGCAPI:<landing-url>"',
        notes:
            'Modern REST API for tiled content. Client support varies: map/raster tiles and vector .pbf tiles are not handled by the same client paths.'
    }
};

