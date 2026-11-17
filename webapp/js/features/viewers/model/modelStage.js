// @ts-check
/**
 * modelStage - the scene both 3D model viewers show: a dark background, the lighting of the
 * Preferences, a model scaled to a sphere of radius 1, arcball controls and a render loop that
 * follows the size of the canvas.
 *
 * The viewers use different builds of three.js (the Nexus viewer the global one of Potree, the
 * bm3d viewer the npm one), so the stage is given the build it works with and never mixes
 * objects of two: the model is framed from plain numbers.
 *
 *   const stage = createModelStage({ THREE, ArcballControls, canvas, settings });
 *   const model = new Bm3dObject(url, () => stage.frameModel(model, sphere), () => {}, stage.renderer);
 *   stage.scene.add(model);
 *   stage.start();                 // ...and stage.dispose() when the viewer goes away
 *   stage.resetView();             // Home: the camera back to the framing of the model
 *   stage.frameShape(shape);       // a flat model: Home looks at its plane, not along it
 */
import { watch } from 'vue';
import { fitDistance, canvasNeedsResize } from '@/features/viewers/unified/sceneUtils';
import { tokenHex } from '@/libs/colorScheme';
import { appliedPixelRatio, watchPixelRatio } from '@/libs/pixelRatio';

// The vertical field of view of the camera, in degrees
const FOV = 35;
// Room around the unit sphere the model is scaled to (the mesh is not strictly inside it)
const FIT_MARGIN = 1.25;
// The viewers are dark in both themes: --ddb-viewer-bg has one value
const BACKGROUND = () => tokenHex('--ddb-viewer-bg');
// A model is flat when its thinnest principal extent is less than this part of its longest: the
// camera of Home then looks along the normal of its plane (frameShape)
const FLAT_RATIO = 0.05;
// From r165 three.js has only lights in physical units (a light of intensity 1 is 1/PI as bright as
// one of the earlier releases, which scaled the light by PI)
const PHYSICAL_LIGHTS_REVISION = 165;

/**
 * How the stage has to treat the three.js build it is given to look like the Nexus viewer (the
 * three.js r124 of Potree), which the lighting of the Preferences was made for and the users are
 * used to:
 *  - lightScale: the factor of a light's intensity that gives the same shading as in r124 (the
 *    PI that releases since r165 no longer put into their lights);
 *  - colourManaged: the build has colour management (r152+). The bm3d viewer uploads the bytes of
 *    its textures and vertex colours as they are, with no decoding of the sRGB they are in, so the
 *    renderer must not encode its output to sRGB again (that washes the picture out) and the
 *    colours of the stage are the raw values of their hex codes, as in r124, not converted from
 *    sRGB to the linear working space.
 * @param {any} THREE
 * @returns {{ lightScale: number, colourManaged: boolean }}
 */
export function legacyLook(THREE) {
    return {
        lightScale: parseInt(THREE.REVISION, 10) >= PHYSICAL_LIGHTS_REVISION ? Math.PI : 1,
        colourManaged: THREE.LinearSRGBColorSpace !== undefined
    };
}

/**
 * @typedef {{ ambientIntensity: number, directionalIntensity: number, shininess: number }} Lighting
 * @typedef {{ direction: number[], up: number[] }} HomeView  the camera of Home: where it stands from the
 *   centre (a unit vector) and its up
 */

/** The view of Home of a model that is not flat: from +z, with +y up. */
export const DEFAULT_HOME_VIEW = Object.freeze({ direction: [0, 0, 1], up: [0, 1, 0] });

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = v => { const l = Math.hypot(...v); return v.map(x => x / l); };

/**
 * The view of Home for a model of these principal axes (bm3d-viewer's computePrincipalAxes: unit
 * axes from the longest extent to the shortest): the default one for a model with a thickness, and
 * for a flat one the view along the normal of its plane, from the side of its largest component (from
 * above for a terrain, Z up or Y up), with +y up, or -z when it looks along y (a top view of a Y-up
 * model). A camera on +z sees a model in a plane that holds the z axis exactly edge-on: nothing.
 * @param {{ axes: number[][], extents: number[] } | null} shape
 * @returns {HomeView}
 */
export function homeViewOf(shape) {
    if (!shape || !(shape.extents[2] < FLAT_RATIO * shape.extents[0])) return DEFAULT_HOME_VIEW;
    const normal = unit(shape.axes[2]);
    const largest = normal.reduce((k, x, i) => (Math.abs(x) > Math.abs(normal[k]) ? i : k), 0);
    const direction = normal[largest] < 0 ? normal.map(x => -x) : normal;
    const wanted = Math.abs(direction[1]) < 0.9 ? [0, 1, 0] : [0, 0, -1];
    const along = dot(wanted, direction);
    return { direction, up: unit(wanted.map((x, i) => x - along * direction[i])) };
}

/**
 * @param {object} options
 * @param {any} options.THREE             a three.js namespace (the viewer's own build)
 * @param {any} options.ArcballControls   the arcball controls class of that build
 * @param {HTMLCanvasElement} options.canvas
 * @param {Lighting} options.settings     the lighting (a reactive object: a change is applied to the lights)
 */
export function createModelStage({ THREE, ArcballControls, canvas, settings }) {
    const { lightScale, colourManaged } = legacyLook(THREE);
    // A colour of the stage from its hex code, as the build without colour management reads it
    // (the colour space is not a parameter there)
    const colour = hex => new THREE.Color().setHex(hex, THREE.LinearSRGBColorSpace);

    const camera = new THREE.PerspectiveCamera(FOV, 2, 0.1, 100);
    camera.position.z = 4.0;
    // The model is scaled to a sphere of radius 1; the camera stands where that sphere (and some
    // room, as the mesh reaches out of it) fits the canvas, whatever its shape
    let fittedDistance = camera.position.length();

    const scene = new THREE.Scene();
    scene.background = colour(BACKGROUND());
    scene.fog = new THREE.Fog(colour(BACKGROUND()), 2000, 3500);

    const lights = {
        ambient: new THREE.AmbientLight(0xffffff, settings.ambientIntensity * lightScale),
        // Natural sky/ground fill
        hemisphere: new THREE.HemisphereLight(0xffffff, colour(0x444444), 0.4 * lightScale),
        key: new THREE.DirectionalLight(0xffffff, settings.directionalIntensity * lightScale),
        back: new THREE.DirectionalLight(0xffffff, settings.directionalIntensity * lightScale)
    };
    lights.key.position.set(1, 1, -1);
    lights.back.position.set(-1, -1, 1);
    Object.values(lights).forEach(light => scene.add(light));

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    if (colourManaged) renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.setClearColor(scene.fog.color);
    // min(devicePixelRatio, 2): the canvas follows it on the next frame (fitCanvas); a screen with another ratio moves it again (FR-XC-32)
    renderer.setPixelRatio(appliedPixelRatio());
    const stopPixelRatio = watchPixelRatio(() => renderer.setPixelRatio(appliedPixelRatio()));

    // MeshLab-style shading for models without a texture, on both sides of the triangles: the winding
    // of many meshes is not consistent (scans, terrain patches wound clockwise), and an open surface
    // is seen from behind when the camera passes under it; a back face is lit with its normal turned
    // to the camera
    const material = new THREE.MeshPhongMaterial({
        color: colour(0xaaaaaa), specular: colour(0x444444), shininess: settings.shininess, side: THREE.DoubleSide
    });

    const controls = new ArcballControls(camera, renderer.domElement, scene);
    controls.setGizmosVisible(false);
    // The view of Home, and whether the user has moved the camera since the stage framed the model
    let homeView = DEFAULT_HOME_VIEW;
    let moved = false;
    const onMoved = () => { moved = true; };
    controls.addEventListener?.('start', onMoved);

    let frame = 0;
    let running = false;

    /** Puts the settings on the lights and on the shaded material. */
    function applyLighting() {
        lights.ambient.intensity = settings.ambientIntensity * lightScale;
        lights.key.intensity = settings.directionalIntensity * lightScale;
        lights.back.intensity = settings.directionalIntensity * lightScale;
        material.shininess = settings.shininess;
        material.needsUpdate = true;
    }
    const stopWatching = watch(settings, applyLighting, { deep: true });

    /** Sets the colour of the shaded material from a hex code (the way the stage reads colours). */
    function setMaterialColor(hex) {
        material.color.copy(colour(hex));
        material.needsUpdate = true;
    }

    /**
     * Scales and moves a model so that its bounding sphere is the unit sphere at the origin. The
     * sphere's centre and radius are used (not the box's centre, which is not the sphere's: a
     * model centred on the box stands off the middle of the view).
     * @param {{ position: any, scale: any }} object
     * @param {{ center: { x: number, y: number, z: number }, radius: number }} sphere
     */
    function frameModel(object, { center, radius }) {
        const s = 1 / radius;
        object.position.set(-center.x * s, -center.y * s, -center.z * s);
        object.scale.set(s, s, s);
    }

    /**
     * Home: puts the camera back where the model is framed (the fitted distance along the direction of
     * the view of Home, +z unless frameShape chose another, the field of view the stage started with,
     * the unit sphere in the middle) and drops the rotation, pan and zoom of the arcball controls. The
     * controls restore a saved state, so the framing is saved first.
     */
    function resetView() {
        // An inertia or a focus the controls still run on animation frames would move the camera again
        if (controls._animationId !== undefined && controls._animationId !== -1) {
            cancelAnimationFrame(controls._animationId);
            controls._animationId = -1;
            controls._timeStart = -1;
        }
        camera.fov = FOV;
        fittedDistance = fitDistance(1, camera.fov, camera.aspect, FIT_MARGIN);
        camera.position.fromArray(homeView.direction).multiplyScalar(fittedDistance);
        camera.up.fromArray(homeView.up);
        camera.lookAt(0, 0, 0);
        camera.zoom = 1;
        camera.updateMatrix();
        camera.updateProjectionMatrix();
        controls.target?.set(0, 0, 0);
        const gizmos = controls._gizmos;
        if (gizmos) {
            gizmos.position.set(0, 0, 0);
            gizmos.quaternion.set(0, 0, 0, 1);
            gizmos.updateMatrix();
        }
        controls.saveState?.();
        controls.reset?.();
        moved = false;
    }

    /**
     * Takes the view of Home from the shape of the model (homeViewOf), once its principal axes are
     * known, and goes there unless the user has already moved the camera: a flat model is then seen
     * face-on, not along its plane.
     * @param {{ axes: number[][], extents: number[] } | null} shape
     */
    function frameShape(shape) {
        homeView = homeViewOf(shape);
        if (!moved) resetView();
    }

    function fitCanvas() {
        const el = renderer.domElement;
        if (!canvasNeedsResize(el, renderer.getPixelRatio())) return;
        renderer.setSize(el.clientWidth, el.clientHeight, false);
        camera.aspect = el.clientWidth / el.clientHeight;
        camera.updateProjectionMatrix();
        // Keeps the view the user has (zoom, angle and pan) and only follows the new shape: the
        // camera moves along its line to the centre it orbits, not to the world origin, which
        // a pan has moved off the middle of the view. ArcballControls keeps that centre on
        // its gizmos (its target is only the centre set from outside; a pan does not move it).
        const distance = fitDistance(1, camera.fov, camera.aspect, FIT_MARGIN);
        const pivot = controls._gizmos?.position ?? controls.target;
        camera.position.sub(pivot).multiplyScalar(distance / fittedDistance).add(pivot);
        fittedDistance = distance;
    }

    function animate() {
        // lifetime: paired (cancelled in dispose)
        frame = requestAnimationFrame(animate);
        fitCanvas();
        renderer.render(scene, camera);
        controls.update();
    }

    /** Starts the render loop. */
    function start() {
        if (running) return;
        running = true;
        animate();
    }

    /** Stops the loop and releases the WebGL context. The viewer disposes its model first. */
    function dispose() {
        running = false;
        stopWatching();
        stopPixelRatio();
        cancelAnimationFrame(frame);
        controls.removeEventListener?.('start', onMoved);
        controls.dispose?.();
        material.dispose();
        renderer.dispose();
        // The browser keeps a few WebGL contexts: the one of a viewer that is gone is let go now, not when it is collected
        renderer.forceContextLoss?.();
    }

    return { scene, camera, renderer, material, controls, setMaterialColor, frameModel, frameShape, resetView, start, dispose };
}
