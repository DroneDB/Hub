// @ts-check
/**
 * The point-cloud-only tools of the viewer's toolbar (FR-VWR-26): the clip volume, the standard views and the colour
 * of the points. Each one does what the icon of the Potree 1.8 menu does, through the viewer, so the menu (kept for the
 * advanced settings) and the toolbar stay in step. The vendored Potree is not changed.
 */

/** The views of the toolbar: the button and the method of the Potree viewer that frames it. */
export const VIEWS = Object.freeze([
    { key: 'top', label: 'Top', title: 'Look at the point cloud from above', method: 'setTopView' },
    { key: 'front', label: 'Front', title: 'Look at the point cloud from the front', method: 'setFrontView' },
    { key: 'left', label: 'Left', title: 'Look at the point cloud from the left', method: 'setLeftView' },
    { key: 'right', label: 'Right', title: 'Look at the point cloud from the right', method: 'setRightView' }
]);

/**
 * What the points can be coloured by: the name Potree gives the attribute (its `activeAttributeName`) and the label.
 * `elevation` is computed from the height, so it is always there; the others are attributes of the cloud.
 */
export const COLOR_BY = Object.freeze([
    { name: 'rgba', label: 'Colour' },
    { name: 'elevation', label: 'Elevation' },
    { name: 'intensity', label: 'Intensity' },
    { name: 'classification', label: 'Classification' },
    { name: 'return number', label: 'Return number' }
]);

/**
 * Frames the point cloud from a standard view (Potree sets the angle and fits the cloud to the screen).
 * @param {any} viewer  the Potree viewer
 * @param {string} key  one of VIEWS
 * @returns {boolean} whether the view was set
 */
export function setView(viewer, key) {
    const view = VIEWS.find(v => v.key === key);
    if (!view || typeof viewer?.[view.method] !== 'function') return false;
    viewer[view.method]();
    return true;
}

/**
 * Starts the clip volume of Potree's icon: a box that follows the pointer until it is placed, and that keeps only the
 * points inside it (the clip task and method are those of the menu).
 * @param {any} viewer
 * @returns {any} the volume
 */
export function startClipVolume(viewer) {
    return viewer.volumeTool.startInsertion({ clip: true });
}

/**
 * The clip volumes of a scene: the boxes (`volume.clip`) and the polygons of the menu's clipping tools.
 * @param {any} scene  the Potree scene
 * @returns {number}
 */
export function clipVolumeCount(scene) {
    return (scene?.volumes || []).filter((/** @type {any} */ v) => v.clip === true).length + (scene?.polygonClipVolumes || []).length;
}

/** The events of the scene that change the number of clip volumes. */
export const CLIP_EVENTS = Object.freeze(['volume_added', 'volume_removed', 'polygon_clip_volume_added', 'polygon_clip_volume_removed']);

/** The point formats of LAS 1.4 with a colour (RGB): a COPC cloud is of format 6, 7 or 8. */
const FORMATS_WITH_RGB = Object.freeze([2, 3, 5, 7, 8, 10]);

/**
 * Whether the range of an attribute is known and is more than one value. Potree declares every attribute of a COPC
 * cloud with the range [Infinity, -Infinity] and widens it with each node it loads.
 * @param {any} attribute  a Potree PointAttribute
 */
function varies(attribute) {
    const [min, max] = attribute?.range ?? [];
    return Number.isFinite(min) && Number.isFinite(max) && max > min;
}

/**
 * Whether the cloud has a colour: the range Potree fills for it, or else (Potree never fills the colour range of a
 * COPC cloud) the point format of the COPC header.
 * @param {any} pointcloud
 * @param {any} attribute  its `rgba` attribute
 */
function hasColour(pointcloud, attribute) {
    const [min, max] = attribute?.range ?? [];
    if (Number.isFinite(min) && Number.isFinite(max)) return max > min;
    return FORMATS_WITH_RGB.includes(pointcloud?.pcoGeometry?.copc?.header?.pointDataRecordFormat);
}

/**
 * What the cloud can be coloured by, in the order of COLOR_BY: elevation, the colour when the cloud has one, and the
 * attributes whose range, as far as the cloud is loaded, is more than one value (a range not yet known or of one
 * value would show one colour). The current colouring is always offered.
 * @param {any} pointcloud  a Potree point cloud
 * @param {string} [current]  the `activeAttributeName` of its material
 * @returns {{ name: string, label: string }[]}
 */
export function colorOptions(pointcloud, current) {
    return COLOR_BY.filter(option => {
        if (option.name === 'elevation' || option.name === current) return true;
        const attribute = pointcloud?.getAttribute?.(option.name);
        if (!attribute) return false;
        return option.name === 'rgba' ? hasColour(pointcloud, attribute) : varies(attribute);
    });
}

/**
 * The ranges the options are made of, as one value that changes when the loading of a node widens one of them.
 * @param {any} pointcloud
 * @returns {string}
 */
export function rangeSignature(pointcloud) {
    return COLOR_BY.map(option => (pointcloud?.getAttribute?.(option.name)?.range ?? []).join(',')).join(';');
}

/** What the toolbar says while a clip box follows the pointer (the style of libs/measureHints). */
export const CLIP_HINT = 'Click to place the clip box. Esc cancels.';

/**
 * Starts a clip volume and follows its placing: Escape cancels it (the box is removed and the pointer lets go of
 * it, as measureGestures lets go of a cancelled measure). The placing ends when the box is dropped, when another
 * insertion cancels it, when the box is removed, or with `stop` (the toolbar leaves).
 * @param {any} viewer  the Potree viewer
 * @param {{ onEnd?: () => void, doc?: Document }} [options]  `onEnd`: called once, when the placing ends
 * @returns {{ volume: any, cancel: () => void, stop: () => void } | null}  null when no volume was started
 */
export function placeClipVolume(viewer, { onEnd = () => {}, doc = document } = {}) {
    const volume = startClipVolume(viewer);
    if (!volume) return null;
    const scene = viewer.scene;
    let placing = true;

    const stop = () => {
        if (!placing) return;
        placing = false;
        doc.removeEventListener('keydown', onKey);
        volume.removeEventListener?.('drop', stop);
        viewer.removeEventListener?.('cancel_insertions', stop);
        scene?.removeEventListener?.('volume_removed', onRemoved);
        onEnd();
    };
    const cancel = () => {
        if (!placing) return;
        stop();
        // Potree's end of an insertion detaches the box from the pointer; then it goes
        viewer.dispatchEvent?.({ type: 'cancel_insertions' });
        scene?.removeVolume?.(volume);
        // The input handler lets go of the box, so the next drag moves the camera
        try { viewer.inputHandler?.startDragging(null); } catch { /* no input handler */ }
    };
    /** @param {KeyboardEvent} e */
    const onKey = e => {
        if (e.key !== 'Escape' || e.defaultPrevented) return;
        e.preventDefault();
        cancel();
    };
    /** @param {any} e */
    const onRemoved = e => { if (e.volume === volume) stop(); };

    doc.addEventListener('keydown', onKey);
    volume.addEventListener?.('drop', stop);
    viewer.addEventListener?.('cancel_insertions', stop);
    scene?.addEventListener?.('volume_removed', onRemoved);
    return { volume, cancel, stop };
}

/**
 * Colours the points by an attribute. The menu's material panel follows (its select and the controls of the attribute,
 * such as the range of the intensity) when it is built.
 * @param {any} pointcloud  a Potree point cloud
 * @param {string} name  the `name` of one of COLOR_BY
 * @param {any} [jquery]  jQuery, with the menu's selectmenu
 * @returns {boolean} whether the colour was set
 */
export function setColorBy(pointcloud, name, jquery = /** @type {any} */ (globalThis).$) {
    if (!pointcloud?.material || !COLOR_BY.some(option => option.name === name)) return false;
    pointcloud.material.activeAttributeName = name;
    // The menu's panel shows the controls of the attribute on its own change of the select: run it
    const select = jquery?.('#optMaterial');
    const menu = select?.length ? select.selectmenu('instance') : null;
    menu?.options?.change?.();
    return true;
}
