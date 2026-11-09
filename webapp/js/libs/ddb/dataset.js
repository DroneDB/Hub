import { Entry } from './entry';
import { ApiError } from './apiError';
import { failureMessageOf, isJsonType } from './http/httpClient';
import { BASE_METHOD } from '../stockpileBase';

// The image format of map tiles is the extension of their URL, and the server sends exactly that format. WebP is the
// default: smaller than PNG for the same tile (what a map pulls by the hundred). PNG is the universal one, for URLs
// handed to other software (see ShareEmbed).
const TILE_FORMAT = "webp";

// The piles "Find all piles" asks for (detect-all `maxResults`): the server keeps the biggest ones and counts its
// `totalFound` after that cut, so a list this long may be the largest of more piles
export const DETECT_ALL_MAX_RESULTS = 50;

/**
 * A NoData value as the number the server takes: a finite number or the text of one; null for an empty or invalid entry.
 * @param {number|string|null|undefined} value
 * @returns {number|null}
 */
export function nodataNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = typeof value === 'number' ? value : Number(String(value).trim().replace(',', '.'));
    return Number.isFinite(n) ? n : null;
}

/**
 * The query part of the NoData option of every raster call (tiles, thumbnails, export and the value calls: FR-RAS-31).
 * @param {{ nodata?: number|string|null }} [options]
 */
export function rasterOptionsQuery(options = {}) {
    const nodata = nodataNumber(options && options.nodata);
    return nodata === null ? '' : `&nodata=${encodeURIComponent(String(nodata))}`;
}

/**
 * The query part of the options the raster value calls (info, point, area) share: the NoData value, and the formula of
 * the values (D-022).
 * @param {{ nodata?: number|string|null, formula?: string }} [options]
 */
function valueOptionsQuery(options = {}) {
    const formula = options && options.formula ? `&formula=${encodeURIComponent(options.formula)}` : '';
    return rasterOptionsQuery(options) + formula;
}

export default class Dataset {
    constructor(registry, org, ds) {
        this.registry = registry;
        this.org = org;
        this.ds = ds;
    }

    remoteUri(path) {
        const { remote, secure } = this.registry;

        const proto = secure ? "ddb" : "ddb+unsafe";
        const p = (path && path !== ".") ? `/${path}` : "";

        return `${proto}://${remote}/${this.org}/${this.ds}${p}`;
    }


    get baseApi() {
        return `/orgs/${encodeURIComponent(this.org)}/ds/${encodeURIComponent(this.ds)}`;
    }

    downloadUrl(paths, options = {}) {
        if (typeof paths === "string") paths = [paths];

        let url = `${this.baseApi}/download`;

        const q = new URLSearchParams();

        if (paths !== undefined && paths.length > 1) {
            // One repeated ?path= per file: each query occurrence is treated as a
            // literal path server-side, so filenames can contain ',' and '&'.
            // (A single occurrence still keeps the legacy comma-joined semantics.)
            paths.forEach(p => q.append("path", p));
        } else if (paths !== undefined && paths.length === 1 && paths[0]) {
            // Per-segment encoding: '&' and ',' are legal in a path segment, but '#'
            // and '?' are not; '/' must survive as the separator.
            url += `/${paths[0].split("/").map(encodeURIComponent).join("/")}`;
        }

        if (options.inline) q.set("inline", "1");
        const qs = q.toString();
        if (qs) url += `?${qs}`;

        return url;
    }

    // hash: the entry hash, when known. It makes the URL change when the entry changes, so the
    // server can let the browser reuse the response without revalidating.
    thumbUrl(path, size, hash) {
        let url = `${this.baseApi}/thumb?path=${encodeURIComponent(path)}`;
        if (size) url += `&size=${size}`;
        if (hash) url += `&v=${encodeURIComponent(hash)}`;
        return url;
    }

    datasetThumbUrl(size) {
        let url = `${this.baseApi}/thumb`;
        if (size) url += `?size=${size}`;
        return url;
    }

    // options: retina, hash (the entry hash, versions the URL), format ("png" | "webp" | "jpg", TILE_FORMAT by default)
    tileUrl(path, tz, tx, ty, options = {}) {
        let retina = "";
        if (options.retina) retina = "@2x";
        const format = options.format || TILE_FORMAT;

        let url = `${this.baseApi}/tiles/${tz}/${tx}/${ty}${retina}.${format}?path=${encodeURIComponent(path)}`;
        if (options.hash) url += `&v=${encodeURIComponent(options.hash)}`;
        return url;
    }

    tileExUrl(path, tz, tx, ty, vizParams = {}, options = {}) {
        let retina = "";
        if (options.retina) retina = "@2x";

        const format = options.format || TILE_FORMAT;

        let url = `${this.baseApi}/tiles-ex/${tz}/${tx}/${ty}${retina}.${format}?path=${encodeURIComponent(path)}`;
        if (vizParams.preset) url += `&preset=${encodeURIComponent(vizParams.preset)}`;
        if (vizParams.bands) url += `&bands=${encodeURIComponent(vizParams.bands)}`;
        if (vizParams.formula) url += `&formula=${encodeURIComponent(vizParams.formula)}`;
        if (vizParams.bandFilter) url += `&bandFilter=${encodeURIComponent(vizParams.bandFilter)}`;
        if (vizParams.colormap) url += `&colormap=${encodeURIComponent(vizParams.colormap)}`;
        if (vizParams.rescale) url += `&rescale=${encodeURIComponent(vizParams.rescale)}`;
        if (vizParams.stretch) url += `&stretch=${encodeURIComponent(vizParams.stretch)}`;
        url += rasterOptionsQuery(vizParams);
        return url;
    }

    async getRasterInfo(path) {
        return this.registry.getRequest(`${this.baseApi}/raster-info?path=${encodeURIComponent(path)}`);
    }

    /**
     * One page of features (GeoJSON FeatureCollection) of a built vector layer, through
     * OGC API Features. collectionId is "<entry path>:<GPKG layer name>". Features of a
     * layer without a coordinate system (a local CAD drawing) come in drawing coordinates.
     */
    async getFeatures(collectionId, { limit = 1000, offset = 0 } = {}) {
        const id = encodeURIComponent(collectionId);
        return this.registry.getRequest(`${this.baseApi}/ogcapi/collections/${id}/items?limit=${limit}&offset=${offset}&f=json`);
    }

    async getRasterMetadata(path, formula, bandFilter) {
        let url = `${this.baseApi}/raster-metadata?path=${encodeURIComponent(path)}`;
        if (formula) url += `&formula=${encodeURIComponent(formula)}`;
        if (bandFilter) url += `&bandFilter=${encodeURIComponent(bandFilter)}`;
        return this.registry.getRequest(url);
    }

    async validateMergeMultispectral(paths) {
        return this.registry.postRequest(`${this.baseApi}/merge-multispectral/validate`, { paths });
    }

    async previewMergeMultispectral(paths, previewBands, thumbSize) {
        return this.registry.makeRequest(`${this.baseApi}/merge-multispectral/preview`, "POST", { paths, previewBands, thumbSize }, null, 'blob');
    }

    async mergeMultispectral(paths, outputPath) {
        return this.registry.postRequest(`${this.baseApi}/merge-multispectral`, { paths, outputPath });
    }

    async validateAlignRaster(sourcePath, referencePath) {
        return this.registry.postRequest(`${this.baseApi}/align/validate`, { sourcePath, referencePath });
    }

    /**
     * The value info of a raster file (U-201, D-021): its exact range in the units of the band, NoData, the default
     * stretch (D-041) and the size of an export with its limit (D-023). `bbox` is a WGS 84 window
     * [minLon, minLat, maxLon, maxLat]: the estimate is that of the window.
     * @param {string} path
     * @param {{ nodata?: number|string|null, formula?: string, bbox?: number[] }} [options]
     */
    async getRasterValueInfo(path, options = {}) {
        let url = `${this.baseApi}/raster-value-info?path=${encodeURIComponent(path)}`;
        url += valueOptionsQuery(options);
        if (Array.isArray(options.bbox) && options.bbox.length === 4) url += `&bbox=${options.bbox.join(',')}`;
        return this.registry.getRequest(url);
    }

    /**
     * The value at a pixel of the raw thermal grid of an R-JPEG, which has no geotransform (§7.1), with the options of the
     * values (FR-RAS-31, D-022). A georeferenced raster takes map coordinates: getRasterPointValueAt.
     * @param {string} path
     * @param {number} x
     * @param {number} y
     * @param {{ nodata?: number|string|null, formula?: string }} [options]
     */
    async getRasterPointValue(path, x, y, options = {}) {
        return this.registry.getRequest(`${this.baseApi}/raster-point-value?path=${encodeURIComponent(path)}&x=${x}&y=${y}${valueOptionsQuery(options)}`);
    }

    /**
     * The value at a map coordinate (WGS 84): libddb finds the pixel of the file under it (U-201, D-021).
     * @param {string} path
     * @param {number} lon
     * @param {number} lat
     * @param {{ nodata?: number|string|null, formula?: string }} [options]
     */
    async getRasterPointValueAt(path, lon, lat, options = {}) {
        return this.registry.getRequest(`${this.baseApi}/raster-point-value?path=${encodeURIComponent(path)}&lon=${lon}&lat=${lat}${valueOptionsQuery(options)}`);
    }

    /**
     * The statistics of a rectangle of pixels of the raw thermal grid of an R-JPEG, with the options of the values. A
     * georeferenced raster takes a WGS 84 window: getRasterAreaStatsOfWindow.
     * @param {string} path
     * @param {number} x0
     * @param {number} y0
     * @param {number} x1
     * @param {number} y1
     * @param {{ nodata?: number|string|null, formula?: string }} [options]
     */
    async getRasterAreaStats(path, x0, y0, x1, y1, options = {}) {
        return this.registry.getRequest(`${this.baseApi}/raster-area-stats?path=${encodeURIComponent(path)}&x0=${x0}&y0=${y0}&x1=${x1}&y1=${y1}${valueOptionsQuery(options)}`);
    }

    /**
     * The statistics of the pixels of the file under a WGS 84 window [minLon, minLat, maxLon, maxLat] (U-201, D-021).
     * @param {string} path
     * @param {number[]} bbox
     * @param {{ nodata?: number|string|null, formula?: string }} [options]
     */
    async getRasterAreaStatsOfWindow(path, bbox, options = {}) {
        return this.registry.getRequest(`${this.baseApi}/raster-area-stats?path=${encodeURIComponent(path)}&bbox=${bbox.join(',')}${valueOptionsQuery(options)}`);
    }

    async getRasterProfile(path, lineStringGeoJson, samples = 256, options = {}) {
        // POST: GeoJSON geometries can exceed the URL length budget.
        const body = {
            path,
            lineString: typeof lineStringGeoJson === 'string'
                ? lineStringGeoJson
                : JSON.stringify(lineStringGeoJson),
            samples,
        };
        const nodata = nodataNumber(options.nodata);
        if (nodata !== null) body.nodata = nodata;
        if (options.formula) body.formula = options.formula;
        return this.registry.postRequest(`${this.baseApi}/raster-profile`, body);
    }

    async calculateStockpileVolume(path, polygonGeoJson, { baseMethod = BASE_METHOD.LOWEST_PERIMETER, flatElevation = 0 } = {}) {
        const body = {
            path,
            polygon: typeof polygonGeoJson === 'string'
                ? polygonGeoJson
                : JSON.stringify(polygonGeoJson),
            baseMethod,
            flatElevation,
        };
        return this.registry.postRequest(`${this.baseApi}/stockpile/calculate`, body);
    }

    async detectStockpile(path, lat, lon, { radius = 50, sensitivity = 0.5 } = {}) {
        const body = { path, lat, lon, radius, sensitivity };
        return this.registry.postRequest(`${this.baseApi}/stockpile/detect`, body);
    }

    /**
     * Every pile of a DEM at once (a scan of the whole raster; the biggest first). Resolves to
     * `{ stockpiles: [{ id, polygon, estimatedVolume, confidence, baseElevation, centroid, areaM2, pixelCount }],
     * totalFound, sensitivityUsed, minAreaUsed }`: `polygon` is a WGS84 GeoJSON Polygon, `estimatedVolume` m³,
     * `areaM2` m², `confidence` 0-1.
     *
     * @param {string} path Dataset-relative path of the elevation raster
     * @param {Object} [options]
     * @param {number} [options.sensitivity=0.5] 0-1, higher finds finer piles
     * @param {number} [options.minArea=5] Smallest pile to report, in m²
     * @param {number} [options.maxResults=DETECT_ALL_MAX_RESULTS] Most piles to return (the server caps it at 500)
     */
    async detectAllStockpiles(path, { sensitivity = 0.5, minArea = 5, maxResults = DETECT_ALL_MAX_RESULTS } = {}) {
        const body = { path, sensitivity, minAreaM2: minArea, maxResults };
        return this.registry.postRequest(`${this.baseApi}/stockpile/detect-all`, body);
    }

    /**
     * Generate contour lines (GeoJSON FeatureCollection of LineStrings with an
     * `elev` property) from a DEM/DSM/DTM raster.
     *
     * Either `interval` or `count` must be supplied. When both are set,
     * `interval` wins.
     *
     * @param {string} path Dataset-relative path of the raster
     * @param {Object} options
     * @param {number} [options.interval] Vertical interval between levels (raster units)
     * @param {number} [options.count] Target number of contour levels
     * @param {number} [options.baseOffset=0] Reference base elevation
     * @param {number} [options.minElev] Drop contours below this elevation
     * @param {number} [options.maxElev] Drop contours above this elevation
     * @param {number} [options.simplifyTolerance=0] Simplification tolerance in raster CRS units
     * @param {number} [options.bandIndex=1] 1-based raster band index
     */
    async generateContours(path, {
        interval = null,
        count = null,
        baseOffset = 0,
        minElev = null,
        maxElev = null,
        simplifyTolerance = 0,
        bandIndex = 1,
    } = {}) {
        const body = {
            path,
            interval,
            count,
            baseOffset,
            minElev,
            maxElev,
            simplifyTolerance,
            bandIndex,
        };
        return this.registry.postRequest(`${this.baseApi}/contours`, body);
    }

    exportUrl(path, vizParams = {}) {
        let url = `${this.baseApi}/export?path=${encodeURIComponent(path)}&format=geotiff`;
        if (vizParams.preset) url += `&preset=${encodeURIComponent(vizParams.preset)}`;
        if (vizParams.bands) url += `&bands=${encodeURIComponent(vizParams.bands)}`;
        if (vizParams.formula) url += `&formula=${encodeURIComponent(vizParams.formula)}`;
        if (vizParams.bandFilter) url += `&bandFilter=${encodeURIComponent(vizParams.bandFilter)}`;
        if (vizParams.colormap) url += `&colormap=${encodeURIComponent(vizParams.colormap)}`;
        if (vizParams.rescale) url += `&rescale=${encodeURIComponent(vizParams.rescale)}`;
        url += rasterOptionsQuery({ nodata: vizParams.nodata });
        return url;
    }

    Entry(fileEntry) {
        return new Entry(this, fileEntry);
    }

    async download(paths) {
        const formData = new FormData();
        if (paths !== undefined && paths !== null) formData.append('path', paths);
        return this.registry.postFormData(`${this.baseApi}/download`, formData);
    }

    /**
     * Downloads file(s) with a preflight check to detect 429 (Too Many Requests) before
     * initiating the native browser download. This avoids loading the entire file as a blob
     * in memory, and lets the browser handle streaming and progress natively.
     *
     * Flow:
     * 1. Send a lightweight preflight request with X-Download-Check header
     * 2. If 429, throw error so the caller can show a dialog
     * 3. If 200, proceed with window.location.href for native browser download
     *
     * @param {string|string[]} paths - Path(s) to download
     * @param {Object} options - Options (e.g. { inline: true })
     * @returns {Promise<void>}
     * @throws {Error} With .status = 429 when download limit is reached
     */
    async downloadWithCheck(paths, options = {}) {
        const url = this.downloadUrl(paths, options);
        await this.checkDownloadSlot(url);

        // Preflight passed - initiate native browser download
        if (url.length < 2000) {
            window.location.href = url;
        } else {
            // URL too long for browser navigation, use POST to get a temporary short URL
            const { downloadUrl, error } = await this.download(paths);
            if (error) throw new Error(error);
            window.location.href = downloadUrl;
        }
    }

    /**
     * Gets the contents of a file as raw text.
     * Uses getRequestAsText to bypass automatic JSON parsing for file downloads.
     * @param {string} path - Path to the file within the dataset
     * @returns {Promise<string>} File contents as text
     */
    async getFileContents(path) {
        const url = this.downloadUrl(path, { inline: true });
        return this.registry.getRequestAsText(url);
    }

    /** @param {{signal?: AbortSignal}} [options] */
    async info(options = {}) {
        return this.registry.getRequest(`${this.baseApi}`, options);
    }

    async update(name, visibility) {
        const formData = new FormData();
        if (name !== undefined) formData.append('name', name);
        if (visibility !== undefined) formData.append('visibility', visibility);
        return this.registry.putFormData(`${this.baseApi}`, formData);
    }

    /**
     * @param {string} [path]
     * @param {{signal?: AbortSignal}} [options] aborting the signal aborts the listing
     */
    async list(path, options = {}) {
        const formData = new FormData();
        if (path !== undefined && path !== null) formData.append('path', path);
        return this.registry.postFormData(`${this.baseApi}/list`, formData, { signal: options.signal, readOnly: true });
    }

    async listOne(path){
        const l = await this.list(path);
        if (l.length === 1){
            return l[0];
        }else if (l.length === 0){
            throw new Error(`Cannot find: ${path}. It might have been renamed or moved.`);
        }else{
            throw new Error("listOne returned more than 1 element");
        }
    }

    /**
     * @param {string} [query]  a file name pattern ('*' is any)
     * @param {{ path?: string, recursive?: boolean, type?: number, signal?: AbortSignal }} [options]  the folder to search
     *   in (the whole dataset by default), whether to go into its subfolders (the server's default is yes) and the one
     *   entry type to return (`entry.type`, any by default)
     */
    async search(query, { path, recursive, type, signal } = {}){
        const formData = new FormData();
        if (query !== undefined && query !== null) formData.append('query', query);
        if (path !== undefined && path !== null) formData.append('path', path);
        if (recursive !== undefined) formData.append('recursive', String(!!recursive));
        if (type !== undefined && type !== null) formData.append('type', String(type));
        return this.registry.postFormData(`${this.baseApi}/search`, formData, { readOnly: true, signal });
    }

    async delete() {
        return this.registry.deleteRequest(`${this.baseApi}`);
    }

    /**
     * The open chunked uploads of the caller in this dataset (FR-UPL-04, §7.1): `{ fileId, path, totalFileSize,
     * totalChunks, chunkSize, sourceFileName, lastModified, received, missing, complete }` each. After a reload the
     * upload dialog offers to resume them.
     * @returns {Promise<Array<{ fileId: string, path: string, totalFileSize: number, totalChunks: number, chunkSize: number, sourceFileName: string|null, lastModified: number|null, received: number[], missing: number[], complete: boolean }>>}
     */
    async listChunkUploads() {
        return this.registry.makeRequest(`${this.baseApi}/obj/chunk`, { method: 'GET', cache: false });
    }

    /**
     * Removes the chunks that the server stores for a chunked upload (the Cancel of an upload, FR-UPL-04); the files
     * that the batch already sent stay. An upload the server does not know (404) is already gone.
     * @param {string} fileId
     */
    async deleteChunkUpload(fileId) {
        return this.registry.makeRequest(`${this.baseApi}/obj/chunk/${encodeURIComponent(fileId)}`, 'DELETE');
    }

    async deleteObj(path) {
        const formData = new FormData();
        formData.append('path', path);
        return this.registry.deleteFormData(`${this.baseApi}/obj`, formData);
    }

    async deleteObjs(paths) {
        const formData = new FormData();
        paths.forEach(path => formData.append('paths', path));
        return this.registry.deleteFormData(`${this.baseApi}/obj/batch`, formData);
    }

    async moveObj(source, dest) {
        const formData = new FormData();
        formData.append('source', source);
        formData.append('dest', dest);
        return this.registry.putFormData(`${this.baseApi}/obj`, formData);
    }

    async copyObj(source, dest, overwrite = false) {
        if (!source) throw new Error("Invalid source path");
        if (!dest) throw new Error("Invalid destination path");

        const formData = new FormData();
        formData.append('source', source);
        formData.append('dest', dest);
        formData.append('overwrite', overwrite);
        return this.registry.postFormData(`${this.baseApi}/obj/copy`, formData);
    }

    async transferObj(sourcePath, destOrgSlug, destDsSlug, destPath = "", overwrite = false, keepSource = false) {
        if (!sourcePath) throw new Error("Invalid source path");
        if (!destOrgSlug) throw new Error("Invalid destination organization");
        if (!destDsSlug) throw new Error("Invalid destination dataset");

        const formData = new FormData();
        formData.append('sourcePath', sourcePath);
        formData.append('destOrgSlug', destOrgSlug);
        formData.append('destDsSlug', destDsSlug);
        formData.append('destPath', destPath);
        formData.append('overwrite', overwrite);
        formData.append('keepSource', keepSource);
        return this.registry.postFormData(`${this.baseApi}/transfer`, formData);
    }

    // A file that exists at `path` (any letter case) is refused with 409 and `conflictPath` unless
    // `overwrite` is true (D-040): a caller that saves a file it opened, or one it owns, replaces it
    async writeObj(path, content, { overwrite = false } = {}) {
        return this.uploadObj(path, new Blob([content]), { overwrite });
    }

    async uploadObj(path, file, { overwrite = false } = {}) {
        const formData = new FormData();
        formData.append('path', path);
        // Before the file: the Registry reads the flag sent before the file part
        if (overwrite) formData.append('overwrite', 'true');
        formData.append('file', file);
        return this.registry.postFormData(`${this.baseApi}/obj`, formData);
    }

    async createFolder(path) {
        const formData = new FormData();
        formData.append('path', path);
        return this.registry.postFormData(`${this.baseApi}/obj`, formData);
    }

    async rename(slug) {
        if (typeof slug !== "string") throw new Error(`Invalid slug ${slug}`);
        const formData = new FormData();
        formData.append('slug', slug);
        return this.registry.postFormData(`${this.baseApi}/rename`, formData);
    }

    // The values of a meta key (the parsed JSON the server answers: for a list key, [{ id, data, mtime }]);
    // a 404 means the key has no value. Reads share the short request cache unless `cache` is false,
    // for a caller that has to see what the server holds now (before it writes, or to check a conflict).
    async metaGet(key, path = "", { cache = true } = {}) {
        if (!key) throw new Error(`Invalid key ${key}`);
        const url = `${this.baseApi}/meta/get/${encodeURIComponent(key)}${path ? `?path=${encodeURIComponent(path)}` : ""}`;
        return cache ? this.registry.getRequest(url) : this.registry.getRequest(url, { cache: false });
    }

    // The server parses the value as JSON, so strings are quoted and objects serialized
    async metaSet(key, data, path = "") {
        return this.metaWrite('set', key, data, path);
    }

    // Appends an entry to a list key (a key may hold many); returns the new entry with its id
    async metaAdd(key, data, path = "") {
        return this.metaWrite('add', key, data, path);
    }

    async metaWrite(action, key, data, path) {
        if (!key) throw new Error(`Invalid key ${key}`);
        if (data === undefined) throw new Error(`Invalid data`);
        const formData = new FormData();
        formData.append('key', key);
        formData.append('data', JSON.stringify(data));
        formData.append('path', path);
        return this.registry.postFormData(`${this.baseApi}/meta/${action}`, formData);
    }

    // Removes one entry of a list key by the id metaAdd returned
    async metaRemove(id) {
        if (!id) throw new Error(`Invalid id ${id}`);
        const formData = new FormData();
        formData.append('id', id);
        return this.registry.postFormData(`${this.baseApi}/meta/remove`, formData);
    }

    async metaUnset(key, path = "") {
        if (!key) throw new Error(`Invalid key ${key}`);
        const formData = new FormData();
        formData.append('key', key);
        formData.append('path', path);
        return this.registry.postFormData(`${this.baseApi}/meta/unset`, formData);
    }

    async setVisibility(visibility) {
        const v = parseInt(visibility);
        if (isNaN(v)) throw Error("Invalid visibility value");

        return this.metaSet("visibility", v);
    }

    async getVisibility(){
        const info = await this.info();
        return info[0].properties?.meta?.visibility?.data;
    }

    async build(path, force = false) {
        if (!path) throw new Error(`Invalid path ${path}`);

        const formData = new FormData();
        formData.append('path', path);
        formData.append('force', force);
        const response = await this.registry.postFormData(`${this.baseApi}/build`, formData);

        return response === true ? { success: true } : response;
    }

    // Sets the coordinate system of a CAD drawing (.dxf, .dwg) by writing its .prj:
    // an EPSG code, WKT or PROJ string, or "local" to keep it in drawing coordinates
    async setCadCrs(path, crs) {
        if (!path) throw new Error(`Invalid path ${path}`);

        const formData = new FormData();
        formData.append('path', path);
        formData.append('crs', crs);
        return this.registry.postFormData(`${this.baseApi}/cad/crs`, formData);
    }

    async rescan(stopOnError = false) {
        const params = new URLSearchParams({ stopOnError: stopOnError.toString() });
        return this.registry.postRequest(`${this.baseApi}/rescan?${params}`, {});
    }

    // ---- Processing Platform tasks (heavy tools) --------------------------

    /**
     * Lists the heavy tools available for this dataset (catalog).
     * @returns {Promise<Array>} Tool descriptors { id, version, title, requiredAccess, producesArtifact, inputSchema }
     */
    async getTaskTools() {
        return this.registry.getRequest(`${this.baseApi}/tasks/tools`);
    }

    /**
     * Submits a heavy task.
     * @param {string} toolId Tool identifier (e.g. "photogrammetry", "raster-export", "build")
     * @param {Object} options
     * @param {string} [options.version] Tool version
     * @param {string} [options.path] Target path
     * @param {Object} [options.params] Tool-specific parameters
     * @param {boolean} [options.force] Bypass dedup
     * @returns {Promise<Object>} { taskId, toolId, version, deduplicated, statusUrl, resultUrl, estimatedOutputBytes }
     */
    async submitTask(toolId, { version = undefined, path = undefined, params = {}, force = false } = {}) {
        if (!toolId) throw new Error('Invalid toolId');
        return this.registry.postRequest(`${this.baseApi}/tasks`, {
            toolId, version, path, params, force
        });
    }

    /**
     * Lists tasks for this dataset.
     * @param {Object} [filter]
     * @param {string} [filter.toolId]
     * @param {string} [filter.state]
     * @param {number} [filter.skip]
     * @param {number} [filter.take]
     * @returns {Promise<Array>} Task summaries
     */
    async getTasks({ toolId = undefined, state = undefined, skip = 0, take = 50 } = {}) {
        const q = new URLSearchParams();
        if (toolId) q.append('toolId', toolId);
        if (state) q.append('state', state);
        q.append('skip', String(skip));
        q.append('take', String(take));
        return this.registry.getRequest(`${this.baseApi}/tasks?${q}`);
    }

    /**
     * Gets the full status of a single task (includes log tail and artifact info).
     * @param {string} id Task id
     */
    async getTask(id) {
        if (!id) throw new Error('Invalid task id');
        return this.registry.getRequest(`${this.baseApi}/tasks/${encodeURIComponent(id)}`);
    }

    /**
     * Gets incremental log lines for a task beyond the given cursor.
     * @param {string} id Task id
     * @param {number} [since] Cursor returned by a previous call
     * @returns {Promise<Object>} { cursor, lines, truncatedFromTail }
     */
    async getTaskLog(id, since = 0) {
        if (!id) throw new Error('Invalid task id');
        return this.registry.getRequest(`${this.baseApi}/tasks/${encodeURIComponent(id)}/log?since=${since}`);
    }

    /**
     * Cancels (deletes) a running or queued task.
     * @param {string} id Task id
     */
    async cancelTask(id) {
        if (!id) throw new Error('Invalid task id');
        return this.registry.deleteRequest(`${this.baseApi}/tasks/${encodeURIComponent(id)}`);
    }

    /**
     * Requeues a failed task.
     * @param {string} id Task id
     */
    async retryTask(id) {
        if (!id) throw new Error('Invalid task id');
        return this.registry.postRequest(`${this.baseApi}/tasks/${encodeURIComponent(id)}/retry`, {});
    }

    /**
     * Deletes a concluded task (Succeeded/Failed/Deleted) from the history.
     * @param {string} id Task id
     */
    async deleteTask(id) {
        if (!id) throw new Error('Invalid task id');
        return this.registry.postRequest(`${this.baseApi}/tasks/${encodeURIComponent(id)}/delete`, {});
    }

    /**
     * Clears terminal tasks (Succeeded/Failed/Deleted) from the history.
     * @param {string} [toolId] Restrict to a single tool
     */
    async clearTasks(toolId = undefined) {
        const q = toolId ? `?toolId=${encodeURIComponent(toolId)}` : '';
        return this.registry.postRequest(`${this.baseApi}/tasks/clear${q}`, {});
    }

    /**
     * Probes a URL (HEAD request, no download) to verify reachability, derive the
     * file name and check size/deny-list constraints.
     * @param {string} url Absolute http/https URL
     * @param {Object} [opts]
     * @param {string} [opts.username] Optional basic-auth user name
     * @param {string} [opts.password] Optional basic-auth password
     * @returns {Promise<{reachable, sizeBytes, fileName, blocked, sizeExceedsLimit, note}>}
     */
    async verifyUrlImport(url, { username, password } = {}) {
        if (!url) throw new Error('Invalid URL');
        return this.registry.postRequest(`${this.baseApi}/import/verify-url`, { url, username, password });
    }

    /**
     * Submits an import-file heavy task that downloads the file from the URL into
     * this dataset.
     * @param {Object} req
     * @param {string} req.url Absolute http/https URL
     * @param {string} [req.fileName] Destination file name (derived from URL when omitted)
     * @param {string} [req.folder] Destination folder inside the dataset
     * @param {boolean} [req.overwrite] Overwrite existing file (default false)
     * @param {string} [req.username] Optional basic-auth user name
     * @param {string} [req.password] Optional basic-auth password
     * @param {number} [req.sizeBytes] Advertised size captured during verification
     * @returns {Promise<{taskId: string}>}
     */
    async importFromUrl({ url, fileName, folder, overwrite = false, username, password, sizeBytes } = {}) {
        if (!url) throw new Error('Invalid URL');
        return this.registry.postRequest(`${this.baseApi}/import/url`, {
            url, fileName, folder, overwrite, username, password, sizeBytes
        });
    }

    /**
     * Builds the download URL for a completed task's artifact.
     * @param {string} id Task id
     * @returns {string}
     */
    taskResultUrl(id) {
        return `${this.baseApi}/tasks/${encodeURIComponent(id)}/result`;
    }

    /**
     * A completed task's artifact as a Blob (authenticated).
     * @param {string} id Task id
     * @returns {Promise<Blob>}
     */
    taskResult(id) {
        return this.registry.makeRequest(this.taskResultUrl(id), { responseType: 'blob' });
    }

    /**
     * URL of a built file's artifact, served with its download name: the main one (e.g. a COG, a
     * point-cloud EPT) or, with a role, the one of that role (e.g. the .spz made for other tools).
     * @param {string} path
     * @param {string} [role]
     */
    buildArtifactUrl(path, role) {
        const url = `${this.baseApi}/build-artifact?path=${encodeURIComponent(path)}`;
        return role ? `${url}&role=${encodeURIComponent(role)}` : url;
    }

    /**
     * Preflight of a download: asks the server whether a download slot is free
     * (X-Download-Check) before the browser navigates to `url`.
     * @param {string} url
     * @throws {ApiError} status 429 when the user's download limit is reached
     */
    async checkDownloadSlot(url) {
        const response = await this.registry.fetchRaw(url, { headers: { 'X-Download-Check': '1' } });
        if (response.ok) return;
        let message = `Download failed (${response.status})`;
        try {
            if (isJsonType((response.headers.get('Content-Type') || '').toLowerCase())) {
                message = failureMessageOf(await response.json()) || message;
            }
        } catch {
            // No JSON body: keep the default message
        }
        throw new ApiError(message, response.status);
    }
};

