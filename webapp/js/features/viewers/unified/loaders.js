/**
 * What the 3D viewer can show, one loader per entry type:
 * a new format adds an entry to LOADERS. Each loader builds the scene it needs (flat or
 * globe), adds its data and frames it. Rasters, vectors and models are placed in Web
 * Mercator (the server serves them so); point clouds in their own CRS, for precision.
 */
import ddb from 'ddb';
import { isLocalVector } from '@/libs/openItemDefaults';
import { ANALYSIS_COLOR } from '@/libs/map/mapUtils';
import { EPSG } from '@/libs/constants';
import { isFiniteBox, vectorStyle } from './sceneUtils';

// Screen-space error target (px) of DroneDB-built model tiles. Obj2Tiles >= 1.8 writes a
// geometricError from the mesh edge length: at 6 close-ups match the finest LOD while the
// overview downloads ~60% less (at 4 a 168-material model never settles, at 8 close-ups lose
// detail). Older tilesets carry inflated errors and still load their finest LOD here.
const MODEL_TILES_ERROR_TARGET = 6;

const name = entry => ddb.pathutils.basename(entry.path);

/** A tileset streamed coarse-to-fine: the coarse tiles stay up while finer ones load (no holes). */
async function addTileset(scene, url, errorTarget) {
    const tileset = new scene.libs.Tiles3D({ url, errorTarget, ktx2DecoderPath: '/wasm/basis/' });
    // The renderer's default, set because its docs say otherwise and this viewer once disabled it
    tileset.tiles.loadAncestors = true;
    await scene.instance.add(tileset);
    scene.configureTilesetStreaming(tileset);
    return tileset;
}

async function loadGeoraster(scene, entry, dataset) {
    scene.view.loadingText = 'Loading orthophoto...';
    const data = scene.computeExtent(entry);
    if (!data) throw new Error('This georaster has no geographic footprint');
    scene.setupInstance(scene.libs.CoordinateSystem.epsg3857);
    scene.addBasemap(data.extent);
    const { ColorLayer, TiledImageSource, XYZ } = scene.libs;
    const url = dataset.tileUrl(entry.path, '{z}', '{x}', '{y}', { hash: entry.hash });
    const layer = new ColorLayer({
        name: entry.path,
        extent: data.extent,
        source: new TiledImageSource({ source: new XYZ({ url, projection: EPSG.WEB_MERCATOR, minZoom: 14, maxZoom: 22 }) })
    });
    scene.map.addLayer(layer);
    scene.registerLayer(name(entry), 'fa-solid fa-image', () => layer.visible, v => { layer.visible = v; });
    scene.frameExtent(data);
}

async function loadVector(scene, entry, dataset) {
    if (isLocalVector(entry)) return loadLocalVector(scene, entry, dataset);
    scene.view.loadingText = 'Loading vector data...';
    const data = scene.computeExtent(entry);
    if (!data) throw new Error('This vector layer has no geographic footprint');
    scene.setupInstance(scene.libs.CoordinateSystem.epsg3857);
    scene.addBasemap(data.extent);
    const { ColorLayer, VectorTileSource, olStyle } = scene.libs;
    const layer = new ColorLayer({
        name: entry.path,
        extent: data.extent,
        source: new VectorTileSource({ url: `${dataset.baseApi}/mvt/${entry.hash}/{z}/{x}/{y}.pbf`, style: vectorStyle(olStyle) })
    });
    scene.map.addLayer(layer);
    scene.registerLayer(name(entry), 'fa-solid fa-bezier-curve', () => layer.visible, v => { layer.visible = v; });
    scene.frameExtent(data);
}

/**
 * A CAD drawing without a coordinate system: its features in drawing coordinates,
 * from OGC API Features over every layer of the built GeoPackage, in a local scene without
 * a basemap.
 */
async function loadLocalVector(scene, entry, dataset) {
    scene.view.loadingText = 'Loading drawing...';
    const { FeatureCollection, OlVectorSource, OlGeoJSON, Extent, CoordinateSystem, THREE } = scene.libs;
    const vector = (entry.properties && entry.properties.vector) || {};
    const layerNames = (vector.layers || []).map(l => l.name).filter(Boolean);
    // GDAL's single DXF layer
    if (!layerNames.length) layerNames.push('entities');

    const format = new OlGeoJSON();
    const pageSize = 1000;
    const features = [];
    for (const layerName of layerNames) {
        for (let offset = 0; ; offset += pageSize) {
            const page = format.readFeatures(await dataset.getFeatures(`${entry.path}:${layerName}`, { limit: pageSize, offset }));
            features.push(...page);
            scene.view.loadingText = `Loading drawing... ${features.length} features`;
            if (page.length < pageSize) break;
        }
    }
    if (!features.length) throw new Error(`The drawing '${name(entry)}' has no features to display.`);

    const source = new OlVectorSource({ features });
    const [minX, minY, maxX, maxY] = source.getExtent();
    const pad = Math.max(maxX - minX, maxY - minY, 1) * 0.01;
    const crs = CoordinateSystem.unknown;
    scene.view.isLocalDrawing = true;
    scene.view.localUnits = vector.units || '';
    scene.setupInstance(crs);
    const collection = new FeatureCollection({
        source,
        extent: new Extent(crs, minX - pad, maxX + pad, minY - pad, maxY + pad),
        minLevel: 0,
        maxLevel: 0,
        ignoreZ: true,
        style: {
            stroke: { color: ANALYSIS_COLOR, lineWidth: 2 },
            fill: { color: ANALYSIS_COLOR, opacity: 0.25 },
            point: { color: '#ffeb3b', pointSize: 8 }
        }
    });
    await scene.instance.add(collection);
    scene.registerLayer(name(entry), 'fa-solid fa-compass-drafting', () => collection.visible, v => { collection.visible = v; });
    scene.frameBox(new THREE.Box3(new THREE.Vector3(minX, minY, 0), new THREE.Vector3(maxX, maxY, 0)));
}

/** A model's 3D Tiles, in a flat local scene. */
async function loadModel(scene, entry, dataset) {
    scene.view.loadingText = 'Loading 3D model...';
    const url = dataset.Entry(entry).get3DTiles();
    if (!url) throw new Error(`The 3D model '${name(entry)}' is not available in the 3D viewer.\n\nThe OGC 3D Tiles output has not been produced for this model yet.`);
    scene.setupInstance(scene.libs.CoordinateSystem.epsg3857);
    const tileset = await addTileset(scene, url, MODEL_TILES_ERROR_TARGET);
    // Obj2Tiles can emit an empty tileset (infinite volume): it "loads" and shows nothing
    const box = tileset.getBoundingBox();
    if (!box || !isFiniteBox(box)) throw new Error(`The 3D model '${name(entry)}' is not available in the 3D viewer.\n\nIts 3D Tiles output is empty or invalid and needs to be rebuilt.`);
    scene.registerLayer(name(entry), 'fa-solid fa-cube', () => tileset.visible, v => { tileset.visible = v; });
    scene.frameBox(box);
    await scene.waitForFirstRender(() => tileset.tiles.group.children.length > 0, 20000);
    scene.uprightTileset(tileset, box);
}

/**
 * An uploaded 3D Tiles archive (.3tz, extracted at build time like a model's tiles): on the
 * globe when georeferenced (flagged at index time from the root bounding volume), else flat.
 */
async function loadTiles3D(scene, entry, dataset) {
    scene.view.loadingText = 'Loading 3D Tiles...';
    const url = dataset.Entry(entry).get3DTiles();
    if (!url) throw new Error(`The 3D Tiles '${name(entry)}' are not available in the 3D viewer.\n\nThe OGC 3D Tiles output has not been extracted for this archive yet.`);
    const georeferenced = !(entry.properties && entry.properties.georeferenced === false);
    if (georeferenced) scene.setupGlobe();
    else scene.setupInstance(scene.libs.CoordinateSystem.epsg3857);

    const tileset = await addTileset(scene, url, 8);
    let box = tileset.getBoundingBox();
    if (!box || !isFiniteBox(box)) throw new Error(`The 3D Tiles '${name(entry)}' are empty or invalid and cannot be displayed.`);
    scene.registerLayer(name(entry), 'fa-solid fa-cubes', () => tileset.visible, v => { tileset.visible = v; });
    if (georeferenced) scene.frameGlobe(tileset, box);
    else scene.frameBox(box);
    await scene.waitForFirstRender(() => tileset.tiles.group.children.length > 0, 20000);

    // Grounding measures the streamed geometry: only now. The re-frame yields to the user
    if (georeferenced) {
        box = scene.groundGlobeTileset(tileset, box);
        if (!scene.userInteracted) scene.frameGlobe(tileset, box);
    } else {
        scene.uprightTileset(tileset, box);
    }
}

/**
 * A COPC point cloud in its own CRS (from the header). Without a CRS it is shown in local
 * metric coordinates with a badge; with a CRS proj4 can use, it gets a basemap at its ground.
 */
async function loadPointCloud(scene, entry, dataset) {
    scene.view.loadingText = 'Loading point cloud...';
    const { COPCSource, PointCloud, CoordinateSystem } = scene.libs;
    const source = new COPCSource({ url: dataset.Entry(entry).getCopc() });
    // lifetime: owner (the source goes with the scene)
    source.addEventListener('progress', () => { scene.view.progress = source.progress; });
    await source.initialize();
    const crs = (await source.getMetadata()).crs || CoordinateSystem.epsg3857;
    const crsRegistered = scene.registerCrs(crs);
    scene.view.isLocalPointCloud = crs === CoordinateSystem.unknown;
    scene.setupInstance(crs);
    if (scene.instance.renderingOptions) scene.instance.renderingOptions.enableEDL = true;

    const entity = new PointCloud({ source });
    await scene.instance.add(entity);
    scene.colorizePointCloud(entity);
    // Automatic sizing can collapse to sub-pixel for sparse or wide clouds
    entity.pointSize = 2;
    scene.registerLayer(name(entry), 'fa-solid fa-braille', () => entity.visible, v => { entity.visible = v; });

    const box = entity.getBoundingBox();
    if (box && crsRegistered && scene.isGeoreferenced(entry)) {
        const { Extent } = scene.libs;
        scene.addBasemap(new Extent(crs, box.min.x, box.max.x, box.min.y, box.max.y), box.min.z);
    }
    if (box) scene.frameBox(box);
    await scene.waitForFirstRender(() => entity.displayedPointCount > 0, 30000);
    // Adding the basemap can leave the camera off the cloud: re-frame unless the user moved
    if (box && !scene.userInteracted) scene.frameBox(box);
}

const T = ddb.entry.type;

/** entry type -> loader(scene, entry, dataset) */
export const LOADERS = {
    [T.POINTCLOUD]: loadPointCloud,
    [T.GEORASTER]: loadGeoraster,
    [T.VECTOR]: loadVector,
    [T.MODEL]: loadModel,
    [T.TILES3D]: loadTiles3D
};

/**
 * The entry as the viewer sees it (.3tz indexed as generic by older ddb is 3D Tiles), or an
 * error saying why it cannot be shown.
 */
export function viewableEntry(entry) {
    const viewable = entry.type === T.GENERIC && /\.3tz$/i.test(entry.path || '') ? { ...entry, type: T.TILES3D } : entry;
    if (!LOADERS[viewable.type]) throw new Error(`'${name(entry)}' is not supported in the 3D viewer.`);
    // Point clouds without SRS, models, tilesets and local drawings render in their own coordinates
    if (!ddb.entry.hasGeometry(viewable) && ![T.MODEL, T.TILES3D, T.POINTCLOUD].includes(viewable.type) && !isLocalVector(viewable)) {
        throw new Error(`'${name(entry)}' has no geographic footprint and cannot be opened in the 3D viewer.`);
    }
    return viewable;
}
