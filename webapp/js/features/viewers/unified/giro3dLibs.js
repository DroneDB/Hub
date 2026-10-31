import { withColorDepth } from './pointCloudColors';

/**
 * The libraries of the 3D viewer: three.js, Giro3D and the
 * OpenLayers sources, loaded only when the viewer opens (one "giro3d" chunk).
 */
export async function loadGiro3dLibs() {
    const [
        THREE, controls, Instance, GMap, Extent, CoordinateSystem, ColorLayer,
        TiledImageSource, VectorTileSource, PointCloud, COPCSource, Tiles3D, DrawTool,
        XYZ, OSM, olStyle, olProj, ColorMap, ColorMapMode, lasConfig, Globe,
        FeatureCollection, OlVectorSource, OlGeoJSON
    ] = await Promise.all([
        import(/* webpackChunkName: "giro3d" */ 'three'),
        import(/* webpackChunkName: "giro3d" */ 'three/examples/jsm/controls/OrbitControls.js'),
        import(/* webpackChunkName: "giro3d" */ '@giro3d/giro3d/core/Instance.js'),
        import(/* webpackChunkName: "giro3d" */ '@giro3d/giro3d/entities/Map.js'),
        import(/* webpackChunkName: "giro3d" */ '@giro3d/giro3d/core/geographic/Extent.js'),
        import(/* webpackChunkName: "giro3d" */ '@giro3d/giro3d/core/geographic/CoordinateSystem.js'),
        import(/* webpackChunkName: "giro3d" */ '@giro3d/giro3d/core/layer/ColorLayer.js'),
        import(/* webpackChunkName: "giro3d" */ '@giro3d/giro3d/sources/TiledImageSource.js'),
        import(/* webpackChunkName: "giro3d" */ '@giro3d/giro3d/sources/VectorTileSource.js'),
        import(/* webpackChunkName: "giro3d" */ '@giro3d/giro3d/entities/PointCloud.js'),
        import(/* webpackChunkName: "giro3d" */ '@giro3d/giro3d/sources/COPCSource.js'),
        import(/* webpackChunkName: "giro3d" */ '@giro3d/giro3d/entities/Tiles3D.js'),
        import(/* webpackChunkName: "giro3d" */ '@giro3d/giro3d/interactions/DrawTool.js'),
        import(/* webpackChunkName: "giro3d" */ 'ol/source/XYZ.js'),
        import(/* webpackChunkName: "giro3d" */ 'ol/source/OSM.js'),
        import(/* webpackChunkName: "giro3d" */ 'ol/style.js'),
        import(/* webpackChunkName: "giro3d" */ 'ol/proj.js'),
        import(/* webpackChunkName: "giro3d" */ '@giro3d/giro3d/core/ColorMap.js'),
        import(/* webpackChunkName: "giro3d" */ '@giro3d/giro3d/core/ColorMapMode.js'),
        import(/* webpackChunkName: "giro3d" */ '@giro3d/giro3d/sources/las/config.js'),
        import(/* webpackChunkName: "giro3d" */ '@giro3d/giro3d/entities/Globe.js'),
        import(/* webpackChunkName: "giro3d" */ '@giro3d/giro3d/entities/FeatureCollection.js'),
        import(/* webpackChunkName: "giro3d" */ 'ol/source/Vector.js'),
        import(/* webpackChunkName: "giro3d" */ 'ol/format/GeoJSON.js')
    ]);

    // Offline-first: the laz-perf decoder from our own origin (webpack copies it to /wasm),
    // not the public CDN, so COPC decodes in air-gapped / CSP-restricted deployments too
    try { lasConfig.setLazPerfPath('/wasm'); } catch { /* falls back to the CDN default */ }

    return {
        THREE,
        OrbitControls: controls.OrbitControls,
        Instance: Instance.default,
        Map: GMap.default,
        Extent: Extent.default,
        CoordinateSystem: CoordinateSystem.default,
        ColorLayer: ColorLayer.default,
        TiledImageSource: TiledImageSource.default,
        VectorTileSource: VectorTileSource.default,
        PointCloud: PointCloud.default,
        // Colours of the depth the cloud stores (8-bit ones are not turned black)
        COPCSource: withColorDepth(COPCSource.default, THREE.Uint8BufferAttribute),
        Tiles3D: Tiles3D.default,
        DrawTool: DrawTool.default,
        XYZ: XYZ.default,
        OSM: OSM.default,
        olStyle,
        olProj,
        ColorMap: ColorMap.default,
        ColorMapMode: ColorMapMode.default,
        Globe: Globe.default,
        FeatureCollection: FeatureCollection.default,
        OlVectorSource: OlVectorSource.default,
        OlGeoJSON: OlGeoJSON.default
    };
}
