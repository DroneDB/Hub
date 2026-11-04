import ddb from 'ddb';

const OpenItemDefaults = {
    [ddb.entry.type.MARKDOWN]: 'markdown',
    [ddb.entry.type.GEORASTER]: 'map',
    [ddb.entry.type.POINTCLOUD]: 'pointcloud',
    [ddb.entry.type.MODEL]: 'model',
    [ddb.entry.type.PANORAMA]: 'panorama',
    [ddb.entry.type.GEOPANORAMA]: 'panorama',
    [ddb.entry.type.VECTOR]: 'map',
    [ddb.entry.type.GAUSSIAN_SPLAT]: 'splat',
    [ddb.entry.type.TILES3D]: 'unified'
}

/**
 * True for a vector without geolocation: a CAD drawing (DXF/DWG) with no coordinate
 * system, flagged by DroneDB at index time (properties.georeferenced === false). It has
 * no map footprint and no MVT tiles; it is shown without a globe in the unified viewer.
 */
function isLocalVector(entry) {
    return !!entry && entry.type === ddb.entry.type.VECTOR &&
        !!entry.properties && entry.properties.georeferenced === false;
}

/** The view an entry opens with by default (double-click, share links, after a build). */
function defaultViewFor(entry) {
    if (!entry) return undefined;
    if (isLocalVector(entry)) return 'unified';
    return OpenItemDefaults[entry.type];
}

export { OpenItemDefaults, isLocalVector, defaultViewFor };
