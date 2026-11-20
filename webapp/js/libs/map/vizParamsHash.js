// @ts-check
/**
 * The style of a raster layer in the address of the map (FR-RAS-05): Plant Health's Copy Link writes it, the map reads it
 * back when it opens. One codec for both, so what a link carries is what the map restores. The style is the shape of a
 * saved view's layer (libs/views/viewState.js, Layer.vizParams): the same keys, the same values.
 *
 *   #path=odm_orthophoto.tif&formula=NDVI&colormap=rdylgn&rescale=-0.272%2C0.644&stretch=percentile
 */

/** The text keys of a style, in the order they are written */
const TEXT_KEYS = ['preset', 'formula', 'bands', 'colormap', 'rescale', 'rescaleUnit', 'stretch'];

/**
 * @typedef {{ preset?: string, formula?: string, bands?: string, colormap?: string, rescale?: string, rescaleUnit?: string,
 *             stretch?: string, nodata?: number }} VizParams
 */

/**
 * The hash (without "#") of a raster layer's style. Empty values are left out.
 * @param {string} path  the file of the layer
 * @param {VizParams|null|undefined} vizParams
 * @returns {string}
 */
export function encodeVizParamsHash(path, vizParams) {
    const params = new URLSearchParams();
    params.set('path', path);
    const style = /** @type {Record<string, any>} */ (vizParams || {});
    for (const key of TEXT_KEYS) {
        if (style[key]) params.set(key, String(style[key]));
    }
    if (typeof style.nodata === 'number' && Number.isFinite(style.nodata)) params.set('nodata', String(style.nodata));
    return params.toString();
}

/**
 * The file and the style of a hash, null when it names no file.
 * @param {string|null|undefined} hash  with or without the leading "#"
 * @returns {{ path: string, vizParams: VizParams }|null}
 */
export function decodeVizParamsHash(hash) {
    const text = String(hash ?? '').replace(/^#/, '');
    if (!text) return null;
    const params = new URLSearchParams(text);
    const path = params.get('path');
    if (!path) return null;
    /** @type {Record<string, any>} */
    const vizParams = {};
    for (const key of TEXT_KEYS) {
        const value = params.get(key);
        if (value) vizParams[key] = value;
    }
    const nodata = params.get('nodata');
    if (nodata !== null && nodata.trim() !== '' && Number.isFinite(Number(nodata))) vizParams.nodata = Number(nodata);
    return { path, vizParams };
}
