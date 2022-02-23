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
    [entry.type.MODEL]: "cube"
};

export default {
    getForType: function(entryType){
        return typeIconMap[entryType] || "question";
    }
}