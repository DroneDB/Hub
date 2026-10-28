// @ts-check
/**
 * splatStage - what the splat viewer draws on: the WebGL renderer (pixel ratio capped, the canvas
 * following its size on the page), the scene and camera, the Spark renderer that sorts and streams
 * the splats, OrbitControls, the render loop, and the loss of the WebGL context. It owns
 * everything it creates and `dispose()` releases all of it, whatever the stage was doing.
 *
 * The three.js and Spark modules are given, not imported: the viewer loads them (in parallel with
 * its data) and a spec gives stand-ins.
 *
 * What is drawn on top of the splats (measurements, pins) lives in `stage.overlay`, a group the
 * viewer turns like the splat mesh, and its HTML labels are drawn by a CSS2DRenderer into the
 * `labelLayer` element when one is given. `pickSplat(ndc)` finds the point of the splats under a
 * point of the screen: the one thing the measurement and the pins need from the splats.
 *
 *   assertWebGL2();                                   // a friendly error before anything loads
 *   const stage = createSplatStage({ THREE, OrbitControls, Spark, canvas, streaming, onFrame });
 *   const mesh = await stage.loadMesh({ url, paged: true }, onProgress);   // null when disposed meanwhile
 *   if (mesh) stage.start();                          // ...and stage.dispose() when the viewer goes away
 *   const hit = stage.pickSplat({ x: 0, y: 0 });      // { point, distance } or null
 */
import { canvasNeedsResize } from '@/features/viewers/unified/sceneUtils';

// Splat rendering is limited by fill rate: a phone at a ratio of 3 or more draws 2.25 times the
// pixels of a ratio of 2 for a sharpness no one sees on soft splats
export const MAX_PIXEL_RATIO = 2;
const BACKGROUND = 0x1a1a2e;

// How many splats of the level of detail Spark keeps up to date for picking, which a paged .rad
// needs to be picked at all (only part of it is in memory, and which part changes with the view).
// Spark's own defaults, written down because the viewer depends on them
const PICK_SPLATS = 25000;
const PICK_SPLATS_TOUCH = 10000;

/**
 * Whether the browser can create a WebGL 2 context (Spark needs it).
 * @param {() => HTMLCanvasElement} [createCanvas]
 */
export function supportsWebGL2(createCanvas = () => document.createElement('canvas')) {
    try {
        const gl = createCanvas().getContext('webgl2');
        if (!gl) return false;
        // Lets the browser free the probe context at once (browsers allow only a few at a time)
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return true;
    } catch {
        return false;
    }
}

/** Throws a message a user can act on when the browser has no WebGL 2. */
export function assertWebGL2(createCanvas) {
    if (!supportsWebGL2(createCanvas)) {
        throw new Error('This browser or device does not support WebGL 2, which the Gaussian Splat viewer needs. '
            + 'Try another browser, or turn on hardware acceleration in its settings.');
    }
}

/**
 * The fraction a Spark progress event says is loaded (0 to 1), or null when the total is not known
 * (a streamed file has none).
 * @param {{ lengthComputable?: boolean, loaded: number, total: number }} event
 */
export function progressFraction(event) {
    if (!event || !event.lengthComputable || !(event.total > 0)) return null;
    return Math.min(1, event.loaded / event.total);
}

/**
 * @param {object} options
 * @param {any} options.THREE                       the three.js namespace
 * @param {any} options.OrbitControls               the OrbitControls class
 * @param {{ SparkRenderer: any, SplatMesh: any }} options.Spark
 * @param {HTMLCanvasElement} options.canvas
 * @param {boolean} options.streaming               a paged .rad: Spark spends its splat budget toward the view direction
 * @param {{ x: number, y: number, z: number }} [options.up]  the scene's up axis, set on the camera before the controls exist
 * @param {(time: number) => void} [options.onFrame]  called every frame, after the canvas was fitted and before it is drawn
 * @param {() => void} [options.onContextLost]
 * @param {() => void} [options.onContextRestored]
 * @param {any} [options.CSS2DRenderer]             the CSS2DRenderer class, to draw HTML labels in the scene
 * @param {HTMLElement} [options.labelLayer]        the element the labels are drawn in (over the canvas)
 */
export function createSplatStage({
    THREE, OrbitControls, Spark, canvas, streaming, up, onFrame, onContextLost, onContextRestored, CSS2DRenderer, labelLayer
}) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    renderer.setSize(canvas.clientWidth || 1, canvas.clientHeight || 1, false);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BACKGROUND);
    const camera = new THREE.PerspectiveCamera(60, (canvas.clientWidth || 1) / (canvas.clientHeight || 1), 0.1, 1000);
    camera.position.set(0, 0, 4);
    // OrbitControls reads camera.up once, in its constructor: it has to be final by then
    if (up) camera.up.set(up.x, up.y, up.z);

    // Kept: its sort and level-of-detail workers, its pager and its GPU textures end only with dispose()
    const touch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
    const lodRaycast = touch ? PICK_SPLATS_TOUCH : PICK_SPLATS;
    const spark = new Spark.SparkRenderer(streaming
        ? { renderer, lodRaycast, pagedExtSplats: true, coneFov0: 70.0, coneFov: 120.0, behindFoveate: 0.2, coneFoveate: 0.4 }
        : { renderer, lodRaycast });
    scene.add(spark);

    // Measurements and pins: in the frame of the splats, so the viewer turns it with the mesh
    const overlay = new THREE.Group();
    scene.add(overlay);
    const labels = CSS2DRenderer && labelLayer ? new CSS2DRenderer({ element: labelLayer }) : null;
    labels?.setSize(canvas.clientWidth || 1, canvas.clientHeight || 1);
    const raycaster = new THREE.Raycaster();

    // OrbitControls pans, zooms and auto-rotates; looking around is the viewer's
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableRotate = false;
    controls.enableDamping = false;

    let mesh = null;
    let disposed = false;
    let contextLost = false;

    function fitCanvas() {
        const el = renderer.domElement;
        if (!canvasNeedsResize(el, renderer.getPixelRatio())) return;
        renderer.setSize(el.clientWidth, el.clientHeight, false);
        camera.aspect = el.clientWidth / el.clientHeight;
        camera.updateProjectionMatrix();
        labels?.setSize(el.clientWidth, el.clientHeight);
    }

    // The browser may take the context away (a phone under memory pressure): preventDefault asks
    // for it back, nothing is drawn meanwhile, and three.js rebuilds its own state when it returns
    function lost(/** @type {Event} */ event) {
        event.preventDefault();
        contextLost = true;
        onContextLost?.();
    }
    function restored() {
        contextLost = false;
        onContextRestored?.();
    }
    canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('webglcontextrestored', restored);

    /**
     * Creates the splat mesh, adds it to the scene and waits for it to load. Spark has no way to
     * cancel a download: when the stage is disposed meanwhile the mesh is already disposed, and
     * this resolves null (the caller does nothing more).
     * @param {object} meshOptions                  SplatMesh options (url, paged, lod...)
     * @param {(fraction: number | null) => void} [onProgress]
     * @returns {Promise<any | null>}
     */
    async function loadMesh(meshOptions, onProgress) {
        if (disposed) return null;
        // raycastable: the splats can be picked (measurements and pins)
        const loading = new Spark.SplatMesh({
            raycastable: true,
            ...meshOptions,
            onProgress: onProgress && (event => { if (!disposed) onProgress(progressFraction(event)); })
        });
        mesh = loading;
        scene.add(loading);
        try {
            await loading.initialized;
        } catch (e) {
            if (disposed) return null;
            throw e;
        }
        return disposed ? null : loading;
    }

    /**
     * The nearest point of the splats under a point of the screen, or null (nothing there, or no
     * mesh yet). Spark casts the ray against the splats it has in memory: all of a plain file, and
     * for a paged .rad the level of detail it keeps for picking.
     * @param {{ x: number, y: number }} ndc  normalised device coordinates, -1 to 1 with y up
     * @returns {{ point: any, distance: number } | null}
     */
    function pickSplat(ndc) {
        if (disposed || !mesh) return null;
        raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
        const hit = raycaster.intersectObject(mesh, false)[0];
        return hit ? { point: hit.point.clone(), distance: hit.distance } : null;
    }

    /** Draws every frame: Spark streams and traverses its level of detail from render(). */
    function start() {
        if (disposed) return;
        renderer.setAnimationLoop(/** @param {number} time */ time => {
            if (contextLost) return;
            fitCanvas();
            onFrame?.(time);
            renderer.render(scene, camera);
            labels?.render(scene, camera);
        });
    }

    /** Stops the loop and releases the mesh, Spark, the controls and the WebGL context. */
    function dispose() {
        if (disposed) return;
        disposed = true;
        renderer.setAnimationLoop(null);
        canvas.removeEventListener('webglcontextlost', lost);
        canvas.removeEventListener('webglcontextrestored', restored);
        controls.dispose?.();
        if (mesh) {
            scene.remove(mesh);
            mesh.dispose?.();
            mesh = null;
        }
        scene.remove(overlay);
        scene.remove(spark);
        spark.dispose?.();
        renderer.dispose();
        renderer.forceContextLoss?.();
    }

    return {
        renderer, scene, camera, controls, spark, overlay, loadMesh, pickSplat, start, dispose,
        get disposed() { return disposed; }
    };
}
