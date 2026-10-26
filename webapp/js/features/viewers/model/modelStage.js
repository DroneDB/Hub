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
 */
import { watch } from 'vue';
import { fitDistance } from '@/features/viewers/unified/sceneUtils';

// Room around the unit sphere the model is scaled to (the mesh is not strictly inside it)
const FIT_MARGIN = 1.25;
const BACKGROUND = 0x1a1a2e;

/**
 * @typedef {{ ambientIntensity: number, directionalIntensity: number, shininess: number }} Lighting
 */

/**
 * @param {object} options
 * @param {any} options.THREE             a three.js namespace (the viewer's own build)
 * @param {any} options.ArcballControls   the arcball controls class of that build
 * @param {HTMLCanvasElement} options.canvas
 * @param {Lighting} options.settings     the lighting (a reactive object: a change is applied to the lights)
 */
export function createModelStage({ THREE, ArcballControls, canvas, settings }) {
    const camera = new THREE.PerspectiveCamera(35, 2, 0.1, 100);
    camera.position.z = 4.0;
    // The model is scaled to a sphere of radius 1; the camera stands where that sphere (and some
    // room, as the mesh reaches out of it) fits the canvas, whatever its shape
    let fittedDistance = camera.position.length();

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BACKGROUND);
    scene.fog = new THREE.Fog(BACKGROUND, 2000, 3500);

    const lights = {
        ambient: new THREE.AmbientLight(0xffffff, settings.ambientIntensity),
        // Natural sky/ground fill
        hemisphere: new THREE.HemisphereLight(0xffffff, 0x444444, 0.4),
        key: new THREE.DirectionalLight(0xffffff, settings.directionalIntensity),
        back: new THREE.DirectionalLight(0xffffff, settings.directionalIntensity)
    };
    lights.key.position.set(1, 1, -1);
    lights.back.position.set(-1, -1, 1);
    Object.values(lights).forEach(light => scene.add(light));

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    renderer.setClearColor(scene.fog.color);
    renderer.setPixelRatio(window.devicePixelRatio);

    // MeshLab-style shading for models without a texture
    const material = new THREE.MeshPhongMaterial({ color: 0xaaaaaa, specular: 0x444444, shininess: settings.shininess });

    const controls = new ArcballControls(camera, renderer.domElement, scene);
    controls.setGizmosVisible(false);

    let frame = 0;
    let running = false;

    /** Puts the settings on the lights and on the shaded material. */
    function applyLighting() {
        lights.ambient.intensity = settings.ambientIntensity;
        lights.key.intensity = settings.directionalIntensity;
        lights.back.intensity = settings.directionalIntensity;
        material.shininess = settings.shininess;
        material.needsUpdate = true;
    }
    const stopWatching = watch(settings, applyLighting, { deep: true });

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

    function fitCanvas() {
        const el = renderer.domElement;
        // The drawing buffer is the canvas size times the pixel ratio
        const ratio = renderer.getPixelRatio();
        if (el.width === Math.floor(el.clientWidth * ratio) && el.height === Math.floor(el.clientHeight * ratio)) return;
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
        cancelAnimationFrame(frame);
        controls.dispose?.();
        material.dispose();
        renderer.dispose();
    }

    return { scene, camera, renderer, material, controls, frameModel, start, dispose };
}
