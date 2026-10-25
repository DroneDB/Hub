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

        if (isDDB) {
            this.tileLoadFunction = genTileDDBLoadFunction(url, minZoom, vizParams, retina, hash).bind(this);
        }
    }
};

export default HybridXYZ;