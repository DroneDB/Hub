import ddb from 'ddb';

const OpenItemDefaults = {
    [ddb.entry.type.MARKDOWN]: 'markdown',
    [ddb.entry.type.GEORASTER]: 'map',
    [ddb.entry.type.POINTCLOUD]: 'pointcloud',
    [ddb.entry.type.MODEL]: 'model',
    [ddb.entry.type.PANORAMA]: 'panorama',
    [ddb.entry.type.GEOPANORAMA]: 'panorama',
    [ddb.entry.type.VECTOR]: 'map'
}

export { OpenItemDefaults };