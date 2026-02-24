import { entry } from 'ddb';

const typeIconMap = {
    [entry.type.DIRECTORY]: "folder outline",
    [entry.type.GENERIC]: "file outline",
    [entry.type.GEOIMAGE]: "crosshairs",
    [entry.type.GEORASTER]: "map outline",
    [entry.type.POINTCLOUD]: "braille",
    [entry.type.IMAGE]: "file image outline",
    [entry.type.DRONEDB]: "database",
    [entry.type.MARKDOWN]: "book",
    [entry.type.VIDEO]: "file video outline",
    [entry.type.GEOVIDEO]: "film",
    [entry.type.MODEL]: "cube",
    [entry.type.PANORAMA]: "globe",
    [entry.type.GEOPANORAMA]: "globe",
    [entry.type.VECTOR]: "object ungroup outline",
};

// Extension-based icon overrides for GENERIC type
const extensionIconMap = {
    'pdf': 'file pdf outline',
};

function getExtension(path) {
    if (!path) return '';
    const lastDot = path.lastIndexOf('.');
    if (lastDot === -1 || lastDot === 0) return '';
    return path.substring(lastDot + 1).toLowerCase();
}

export default {
    getForType: function (entryType, path) {
        // Check extension-based overrides for GENERIC type
        if (entryType === entry.type.GENERIC && path) {
            const ext = getExtension(path);
            if (extensionIconMap[ext]) return extensionIconMap[ext];
        }
        return typeIconMap[entryType] || "question";
    }
}