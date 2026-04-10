import ddb from 'ddb';
import { OpenItemDefaults } from '@/libs/openItemDefaults';

// Types that have a dedicated viewer (derived from OpenItemDefaults)
const TYPES_WITH_DEDICATED_VIEWER = Object.keys(OpenItemDefaults).map(Number);

// Type groupings used across the application
const MAP_VIEWABLE_TYPES = [ddb.entry.type.GEORASTER, ddb.entry.type.GEOIMAGE, ddb.entry.type.POINTCLOUD, ddb.entry.type.VECTOR];
const PANORAMA_TYPES = [ddb.entry.type.PANORAMA, ddb.entry.type.GEOPANORAMA];
const THUMBNAIL_CANDIDATE_TYPES = [ddb.entry.type.IMAGE, ddb.entry.type.GEOIMAGE, ddb.entry.type.GEORASTER];

// Helper functions
function hasDedicatedViewer(type) {
    return TYPES_WITH_DEDICATED_VIEWER.includes(type);
}

function isMapViewable(type) {
    return MAP_VIEWABLE_TYPES.includes(type);
}

function isPanoramaType(type) {
    return PANORAMA_TYPES.includes(type);
}

function isThumbnailCandidate(type) {
    return THUMBNAIL_CANDIDATE_TYPES.includes(type);
}

function isDroneDB(type) {
    return type === ddb.entry.type.DRONEDB;
}

function isPlantHealthCapable(entry) {
    if (entry.type === ddb.entry.type.GEORASTER) return true;
    if (entry.type === ddb.entry.type.GEOIMAGE && entry.polygon_geom && /\.tiff?$/i.test(entry.path)) return true;
    return false;
}

// Human-readable type names for display (extends entry.typeToHuman with display-friendly labels)
const TYPE_DISPLAY_NAMES = {
    [ddb.entry.type.DIRECTORY]: 'Folder',
    [ddb.entry.type.GENERIC]: 'File',
    [ddb.entry.type.GEOIMAGE]: 'GeoImage',
    [ddb.entry.type.GEORASTER]: 'GeoRaster',
    [ddb.entry.type.POINTCLOUD]: 'Point Cloud',
    [ddb.entry.type.IMAGE]: 'Image',
    [ddb.entry.type.DRONEDB]: 'DroneDB',
    [ddb.entry.type.MARKDOWN]: 'Markdown',
    [ddb.entry.type.VIDEO]: 'Video',
    [ddb.entry.type.MODEL]: '3D Model',
    [ddb.entry.type.PANORAMA]: 'Panorama',
    [ddb.entry.type.GEOPANORAMA]: 'GeoPanorama',
    [ddb.entry.type.VECTOR]: 'Vector'
};

function getTypeDisplayName(type) {
    return TYPE_DISPLAY_NAMES[type] || 'Unknown';
}

// Sort entries with directories first, then by name
function sortEntriesDirectoriesFirst(entries, getPath) {
    return [...entries].sort((a, b) => {
        const aDir = ddb.entry.isDirectory(a);
        const bDir = ddb.entry.isDirectory(b);

        if (aDir && !bDir) return -1;
        if (!aDir && bDir) return 1;

        const aName = getPath ? getPath(a).toLowerCase() : a.path.toLowerCase();
        const bName = getPath ? getPath(b).toLowerCase() : b.path.toLowerCase();
        return aName > bName ? 1 : -1;
    });
}

export {
    TYPES_WITH_DEDICATED_VIEWER,
    MAP_VIEWABLE_TYPES,
    PANORAMA_TYPES,
    THUMBNAIL_CANDIDATE_TYPES,
    TYPE_DISPLAY_NAMES,
    hasDedicatedViewer,
    isMapViewable,
    isPanoramaType,
    isThumbnailCandidate,
    isDroneDB,
    isPlantHealthCapable,
    getTypeDisplayName,
    sortEntriesDirectoriesFirst
};
