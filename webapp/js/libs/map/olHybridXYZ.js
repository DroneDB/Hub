import XYZ from 'ol/source/XYZ';
import TileState from 'ol/TileState';
import ddb from 'ddb';

// An XYZ source whose tiles come from a DroneDB dataset (ddb:// URI): tile URLs carry the
// visualisation parameters and the entry hash, so a changed entry gets new tiles
function genTileDDBLoadFunction(ddbUri, minZoom, vizParams, retina, hash) {
    const [dataset, path] = ddb.utils.datasetPathFromUri(ddbUri);

    return (tile) => {
        tile.setState(TileState.LOADING);
        const { tileCoord } = tile;
        let [tz, tx, ty] = tileCoord;

        if (minZoom !== undefined && tz < minZoom) {
            // Do not load this one
            tile.setState(TileState.EMPTY);
        } else {
            tile.getImage().onload = () => {
                tile.setState(TileState.LOADED);
            };
            tile.getImage().onerror = e => {
                console.error(e);
                tile.setState(TileState.ERROR);
            };
            if (vizParams && Object.keys(vizParams).length > 0) {
                tile.getImage().src = dataset.tileExUrl(path, tz, tx, ty, vizParams, { retina });
            } else {
                tile.getImage().src = dataset.tileUrl(path, tz, tx, ty, { retina, hash });
            }
        }
    };
}

class HybridXYZ extends XYZ {
    constructor(opt_options) {
        const isDDB = opt_options.url && ddb.utils.isDDBUri(opt_options.url);
        const minZoom = opt_options.minZoom;
        const url = opt_options.url;
        const vizParams = opt_options.vizParams || null;
        // Entry hash, when known: versions the tile URLs (see Dataset.tileUrl).
        const hash = opt_options.hash;
        delete opt_options.hash;

        // Retina requests 512 px tiles into 256 px slots (tilePixelRatio 2),
        // which doubles the effective on-screen resolution of rasters.
        const retina = opt_options.retina ?? ((window.devicePixelRatio || 1) > 1);
        delete opt_options.retina;
        if (retina) opt_options.tilePixelRatio = 2;

        // Override opt_options.url to a dummy URL
        // so that we can send parallel tile requests
        opt_options.url = "https://{z}/{x}/{y}";
        delete opt_options.vizParams;
        super(opt_options);
        // What the tiles show, so a layer is restyled only when this changes
        this.vizParams = vizParams;
        this.ddbTiles = isDDB ? { url, minZoom, retina, hash } : null;
        this.baseKey = this.getKey();

        if (isDDB) {
            this.tileLoadFunction = genTileDDBLoadFunction(url, minZoom, vizParams, retina, hash).bind(this);
            this.setKey(styleKey(this.baseKey, vizParams));
        }
    }

    /**
     * Draws the tiles with another style, in place (FR-RAS-17): the tiles get a new key, so the layer keeps drawing the
     * tiles it has (OpenLayers' stale tiles of the same source) until those of the new style have loaded, instead of
     * blanking as a new source does.
     * @param {object|null} vizParams
     */
    setVizParams(vizParams) {
        const next = vizParams && Object.keys(vizParams).length ? vizParams : null;
        this.vizParams = next;
        if (!this.ddbTiles) return;
        const { url, minZoom, retina, hash } = this.ddbTiles;
        this.tileLoadFunction = genTileDDBLoadFunction(url, minZoom, next, retina, hash).bind(this);
        // The new key also tells the layer that every tile is to be loaded again (it calls changed())
        this.setKey(styleKey(this.baseKey, next));
    }
};

/**
 * The tile key of a style: one per set of parameters, whatever their order.
 * @param {string} baseKey
 * @param {object|null} vizParams
 */
function styleKey(baseKey, vizParams) {
    if (!vizParams || !Object.keys(vizParams).length) return baseKey;
    const sorted = Object.keys(vizParams).sort().map(k => [k, vizParams[k]]);
    return `${baseKey}#${JSON.stringify(sorted)}`;
}

export default HybridXYZ;