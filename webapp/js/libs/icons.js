import { entry } from 'ddb';

const typeIconMap = {
    [entry.type.DIRECTORY]: "fa-regular fa-folder",
    [entry.type.GENERIC]: "fa-regular fa-file",
    [entry.type.GEOIMAGE]: "fa-solid fa-crosshairs",
    [entry.type.GEORASTER]: "fa-regular fa-map",
    [entry.type.POINTCLOUD]: "fa-solid fa-braille",
    [entry.type.IMAGE]: "fa-regular fa-file-image",
    [entry.type.DRONEDB]: "fa-solid fa-database",
    [entry.type.MARKDOWN]: "fa-solid fa-book",
    [entry.type.VIDEO]: "fa-regular fa-file-video",
    [entry.type.GEOVIDEO]: "fa-solid fa-film",
    [entry.type.MODEL]: "fa-solid fa-cube",
    [entry.type.PANORAMA]: "fa-solid fa-globe",
    [entry.type.GEOPANORAMA]: "fa-solid fa-globe",
    [entry.type.VECTOR]: "fa-solid fa-object-ungroup",
};

// Extension-based icon overrides for GENERIC type
const extensionIconMap = {
    'pdf': 'fa-regular fa-file-pdf',
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
        return typeIconMap[entryType] || "fa-solid fa-question";
    }
}