// @ts-check
/**
 * Files dropped on the point cloud viewer that it cannot show.
 *
 * Potree opens a GeoPackage dropped on the page (`.gpkg`) with libraries that the Hub does not ship (lazylibs/geopackage,
 * sql.js): the request answered 404 and the promise of the drop was rejected with nobody to catch it. A GeoPackage of the
 * dataset is a map layer; the viewer says so, and Potree never sees it. Any other drop is Potree's, as before.
 *
 * A drop that holds a GeoPackage and other files (a Potree project, `.json5`) gives Potree the other files: the drop is
 * stopped and sent again with them alone. Where the browser cannot make such a drop (no DataTransfer to build), the
 * whole drop is refused, and the user is told to drop the other files without the GeoPackage.
 */

const UNSUPPORTED = /\.gpkg$/i;

/** @param {DragEvent} event @returns {File[]} */
const droppedFiles = event => Array.from(event.dataTransfer?.files ?? []);

/** @param {DragEvent} event @returns {string[]} the names of the dropped files the viewer cannot show */
export function unsupportedDropsOf(event) {
    return droppedFiles(event).map(file => file.name).filter(name => UNSUPPORTED.test(name));
}

/**
 * The drop of `files` alone, where `event` was dropped, or null when the browser cannot make one.
 * @param {DragEvent} event @param {File[]} files
 * @returns {DragEvent | null}
 */
function dropOfOnly(event, files) {
    try {
        const transfer = new DataTransfer();
        for (const file of files) transfer.items.add(file);
        const drop = new DragEvent('drop', {
            bubbles: true, cancelable: true, clientX: event.clientX, clientY: event.clientY, dataTransfer: transfer
        });
        // A browser that leaves the init's dataTransfer out of the event: the drop carries it all the same
        if (drop.dataTransfer !== transfer) Object.defineProperty(drop, 'dataTransfer', { value: transfer });
        return drop;
    } catch {
        return null;
    }
}

/**
 * @typedef {object} Refusal
 * @property {string[]} names  the files not shown (the GeoPackages)
 * @property {boolean} othersShown  the other files of the drop went to Potree
 * @property {boolean} othersRefused  the drop had other files, and they were refused with it (drop them without the GeoPackage)
 */

/**
 * Takes the drops of files the viewer cannot show before Potree's own handler (on the body) sees them.
 * @param {{ track: (target: EventTarget, type: string, handler: (event: any) => void, options?: any) => void }} session  owner of the listener
 * @param {(names: string[], refusal: Refusal) => void} refuse  tells the user
 * @param {Document} [doc]
 */
export function refuseUnsupportedDrops(session, refuse, doc = document) {
    session.track(doc, 'drop', (/** @type {DragEvent} */ event) => {
        const names = unsupportedDropsOf(event);
        if (!names.length) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const others = droppedFiles(event).filter(file => !UNSUPPORTED.test(file.name));
        const forwarded = others.length ? dropOfOnly(event, others) : null;
        // Sent where the drop was: Potree's handler on the body hears it, this one lets it through (no GeoPackage in it)
        if (forwarded) (event.target ?? doc.body).dispatchEvent(forwarded);
        refuse(names, { names, othersShown: !!forwarded, othersRefused: others.length > 0 && !forwarded });
    }, true);
}
