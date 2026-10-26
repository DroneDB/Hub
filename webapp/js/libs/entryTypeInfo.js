// @ts-check
/**
 * What each entry type means, for the "What is this type?" dialog of the file properties:
 * what DroneDB puts in the type, what an entry of the type holds, what the Hub does with it
 * and examples. The type rules themselves are libddb's (it classifies files at index time);
 * this is their description for people, kept in step with the DroneDB docs entry type table.
 */
import ddb from 'ddb';

const T = ddb.entry.type;
const DOCS = 'https://docs.dronedb.app/docs';

/**
 * @typedef {Object} EntryTypeInfo
 * @property {string} summary    one sentence: what the type is
 * @property {string} detection  how DroneDB decides a file is of this type
 * @property {string[]} contains what the properties of an entry of this type show
 * @property {string[]} actions  what the Hub does with it
 * @property {string[]} examples typical files
 * @property {string} [docsUrl]  the documentation page that covers the type
 */

/** @type {Record<number, EntryTypeInfo>} */
const ENTRY_TYPE_INFO = {
    [T.GEOIMAGE]: {
        summary: 'A photo that knows where it was taken: its GPS position is stored in the file.',
        detection: 'An image (JPG, DNG, TIFF, PNG, WEBP...) whose EXIF/XMP metadata has a GPS position.',
        contains: [
            'Position (latitude, longitude, altitude) and capture time',
            'Camera make, model, sensor size and focal length',
            'Camera orientation (yaw, pitch, roll) when the drone records it',
            'Footprint on the ground, when the camera orientation and sensor are known'
        ],
        actions: [
            'Shown as a point (and footprint) on the dataset map',
            'Opens in the photo viewer; thumbnails come from the file',
            'Multispectral and thermal photos can be merged into bands or analysed'
        ],
        examples: ['DJI_0001.JPG from a drone survey', 'A FLIR thermal R-JPEG', 'One band of a multispectral camera (IMG_0001_4.tif)'],
        docsUrl: `${DOCS}/features/multispectral`
    },
    [T.GEORASTER]: {
        summary: 'A raster map tied to real-world coordinates: every pixel has a known position on the ground.',
        detection: 'A TIFF or JPEG 2000 file (.tif, .tiff, .jp2, .j2k) that has a coordinate system.',
        contains: [
            'Size in pixels and ground resolution (metres per pixel)',
            'Bands and what each holds (Red, Green, Blue, Alpha, Gray...)',
            'Footprint on the map and its coordinate system'
        ],
        actions: [
            'Built into a Cloud Optimized GeoTIFF that the map streams as tiles',
            'Plant health (vegetation indices) for rasters with two or more bands',
            'Value analysis for single-band rasters: elevation models, thermal maps',
            'Border masking and alignment to a reference raster'
        ],
        examples: ['An orthophoto (odm_orthophoto.tif)', 'An elevation model: DSM or DTM (dsm.tif)', 'A multispectral or thermal mosaic'],
        docsUrl: `${DOCS}/features/georaster-processing`
    },
    [T.POINTCLOUD]: {
        summary: 'A set of 3D points, often millions, that samples the shape of the terrain and the objects on it.',
        detection: 'A LAS, LAZ, E57, PTS or XYZ file, or a PLY file that has points but no faces.',
        contains: [
            'Number of points',
            'Dimensions of each point (X, Y, Z, Intensity, Classification, Red, Green, Blue...)',
            'Coordinate system and footprint on the map'
        ],
        actions: [
            'Built into a Cloud Optimized Point Cloud (COPC) for streaming',
            'Opens in the point cloud viewer, with measurements and annotations',
            'Shown on the dataset map'
        ],
        examples: ['A photogrammetry point cloud (odm_georeferenced_model.laz)', 'A LiDAR scan (scan.las)', 'A terrestrial laser scan (site.e57)']
    },
    [T.IMAGE]: {
        summary: 'A picture without a position: DroneDB found no GPS data in it.',
        detection: 'An image (JPG, DNG, TIFF, JPEG 2000, PNG, GIF, WEBP) with no GPS metadata, and not twice as wide as it is high.',
        contains: ['Size in pixels and capture time', 'Camera make and model, when the file has them'],
        actions: ['Opens in the photo viewer; thumbnails come from the file'],
        examples: ['A screenshot or a scanned document', 'A photo taken with location turned off', 'A logo (logo.png)']
    },
    [T.DRONEDB]: {
        summary: 'A folder that is itself a DroneDB dataset: it holds its own index.',
        detection: 'A folder that contains a DroneDB database (.ddb).',
        contains: ['Total size of the files the nested dataset indexes', 'The properties of the nested dataset'],
        actions: ['Browsed like a folder'],
        examples: ['A dataset copied inside another one with its .ddb folder']
    },
    [T.MARKDOWN]: {
        summary: 'A text document written in Markdown, shown formatted.',
        detection: 'A file with the .md extension.',
        contains: ['Size and modification date'],
        actions: ['Opens formatted in the Markdown viewer, where users who can write edit it'],
        examples: ['README.md describing the dataset', 'Flight notes (notes.md)']
    },
    [T.VIDEO]: {
        summary: 'A video without a position: DroneDB found no GPS data in it.',
        detection: 'An MP4, MOV, WEBM, M4V, AVI or MKV file with no GPS metadata.',
        contains: ['Size in pixels and capture time, when the file has them'],
        actions: ['Plays in the photo and video viewer'],
        examples: ['A video recorded with location turned off', 'An edited clip (inspection.mp4)']
    },
    [T.GEOVIDEO]: {
        summary: 'A video that knows where it was recorded: its GPS position is stored in the file.',
        detection: 'An MP4, MOV, WEBM, M4V, AVI or MKV file whose metadata has a GPS position.',
        contains: ['Position (latitude, longitude, altitude) and capture time', 'Size in pixels'],
        actions: ['Shown as a point on the dataset map', 'Plays in the photo and video viewer and in the map popup'],
        examples: ['DJI_0042.MP4 recorded by a drone']
    },
    [T.MODEL]: {
        summary: 'A textured 3D mesh: surfaces made of triangles, with images on them.',
        detection: 'An OBJ file, a glTF or GLB file with a mesh, or a PLY file with faces.',
        contains: [
            'Whether the model is georeferenced (a reference_lla.json or georef.json next to it gives its position)',
            'Footprint on the map, when georeferenced'
        ],
        actions: [
            'Built into Nexus and OGC 3D Tiles for streaming',
            'Opens in the 3D model viewer',
            'Shown on the globe of the unified viewer when georeferenced'
        ],
        examples: ['A photogrammetry mesh (odm_textured_model_geo.obj with its .mtl and textures)', 'A building model (building.glb)'],
        docsUrl: `${DOCS}/features/3d-tiles`
    },
    [T.PANORAMA]: {
        summary: 'A 360° or wide panoramic photo, without a position.',
        detection: 'An image at least twice as wide as it is high, with no GPS metadata.',
        contains: ['Size in pixels', 'Projection type (for example equirectangular)', 'Camera make and model'],
        actions: ['Opens in the panorama viewer, where you look around by dragging'],
        examples: ['A 360° photo from a phone or a 360° camera (PANO_0001.jpg)']
    },
    [T.GEOPANORAMA]: {
        summary: 'A 360° or wide panoramic photo that knows where it was taken.',
        detection: 'An image at least twice as wide as it is high, whose metadata has a GPS position.',
        contains: ['Position (latitude, longitude, altitude) and capture time', 'Size in pixels and projection type', 'Camera make and model'],
        actions: ['Shown as a point on the dataset map', 'Opens in the panorama viewer'],
        examples: ['A spherical panorama shot by a drone (DJI_0100.JPG)']
    },
    [T.VECTOR]: {
        summary: 'Geographic shapes: points, lines and polygons with attributes.',
        detection: 'A GeoJSON, Shapefile (.shp, .shz), GeoPackage, KML/KMZ, GPX, FlatGeobuf, TopoJSON, DXF or DWG file.',
        contains: [
            'Layers, with the number and the geometry type of their features',
            'Extent and coordinate system',
            'For CAD drawings: where the coordinate system comes from, and the drawing units'
        ],
        actions: [
            'Built into a GeoPackage copy and vector tiles for the map',
            'Shown on the dataset map, with the attributes of each feature',
            'A CAD drawing without a coordinate system can be placed with Tools › Set Coordinate System'
        ],
        examples: ['Survey boundaries (parcels.geojson)', 'A Shapefile of roads (roads.shp with .dbf, .shx, .prj)', 'A site plan (plan.dxf)'],
        docsUrl: `${DOCS}/features/vector-processing`
    },
    [T.GAUSSIAN_SPLAT]: {
        summary: 'A photorealistic 3D scene made of millions of small coloured blobs (Gaussian Splatting).',
        detection: 'An SPZ, SPLAT or KSPLAT file, or a PLY file with Gaussian Splat attributes.',
        contains: ['Number of splats and their spherical harmonics degree (how much colour detail each one holds)'],
        actions: ['Built into a level-of-detail container for streaming', 'Opens in the Gaussian Splat viewer'],
        examples: ['A scene trained from drone photos (scene.spz)', 'A splat exported from a training tool (point_cloud.ply)'],
        docsUrl: `${DOCS}/features/gaussian-splat`
    },
    [T.TILES3D]: {
        summary: 'A large 3D model already split into OGC 3D Tiles, ready for streaming.',
        detection: 'A .3tz archive: a ZIP with tileset.json at its root.',
        contains: ['Tileset version and geometric error', 'Whether the tileset is georeferenced'],
        actions: ['Extracted into a tileset folder by the build', 'Opens in the unified viewer, on the globe when georeferenced'],
        examples: ['A city model exported as city.3tz'],
        docsUrl: `${DOCS}/features/3d-tiles`
    },
    [T.GENERIC]: {
        summary: 'A file DroneDB stores but does not interpret.',
        detection: 'Any file that is not of another type.',
        contains: ['Size, modification date and hash'],
        actions: ['Download it; PDF files open in the browser', 'Archives (ZIP, TAR, 7Z...) can be extracted into the dataset'],
        examples: ['A report (report.pdf)', 'A spreadsheet (gcp_list.xlsx)', 'An archive of photos (flight.zip)']
    },
    [T.DIRECTORY]: {
        summary: 'A folder that groups files and other folders.',
        detection: 'A folder of the dataset.',
        contains: ['Path and modification date'],
        actions: ['Browse it, move files in and out of it, download it as a ZIP'],
        examples: ['images/', 'odm_orthophoto/']
    }
};

/**
 * The description of an entry type, or null for a type without one.
 * @param {number} type
 * @returns {EntryTypeInfo | null}
 */
export function getEntryTypeInfo(type) {
    return ENTRY_TYPE_INFO[type] || null;
}
