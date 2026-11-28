// @ts-check
/**
 * Files dropped on the point cloud viewer that it cannot show.
 *
 * Potree opens a GeoPackage dropped on the page (`.gpkg`) with libraries that the Hub does not ship (lazylibs/geopackage,
 * sql.js): the request answered 404 and the promise of the drop was rejected with nobody to catch it. A GeoPackage of the
 * dataset is a map layer; the viewer says so, and Potree never sees the drop. Any other drop is Potree's, as before.
 */

const UNSUPPORTED = /\.gpkg$/i;

/** @param {DragEvent} event @returns {string[]} the names of the dropped files the viewer cannot show */
export function unsupportedDropsOf(event) {
    const files = Array.from(event.dataTransfer?.files ?? []);
    return files.map(file => file.name).filter(name => UNSUPPORTED.test(name));
}

/**
 * Takes the drops of files the viewer cannot show before Potree's own handler (on the body) sees them.
 * @param {{ track: (target: EventTarget, type: string, handler: (event: any) => void, options?: any) => void }} session  owner of the listener
 * @param {(names: string[]) => void} refuse  tells the user
 * @param {Document} [doc]
 */
export function refuseUnsupportedDrops(session, refuse, doc = document) {
    session.track(doc, 'drop', event => {
        const names = unsupportedDropsOf(event);
        if (!names.length) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        refuse(names);
    }, true);
}
