/**
 * createEarthControls - Potree-style "Earth" navigation, built on three.js MapControls.
 *
 * Differs from plain orbit navigation in two ways:
 *  - the camera is constrained to stay above the ground plane (no rolling under the terrain);
 *  - double-clicking re-anchors the orbit pivot on the clicked ground point, so the user
 *    zooms and rotates around whatever they are looking at.
 *
 * MapControls and three are passed in because the unified viewer lazy-loads them, so this
 * module cannot import them at load time.
 *
 * @param libs - the viewer's loaded library bundle ({ THREE, MapControls }).
 * @param camera - the camera to control.
 * @param domElement - the element to listen to.
 * @param onChange - called after the pivot is re-anchored, to request a redraw.
 * @returns a MapControls instance with the ground constraint applied.
 */
export function createEarthControls(libs, camera, domElement, onChange) {
    const { THREE, MapControls } = libs;

    const controls = new MapControls(camera, domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.2;
    // Keep the camera above the ground plane. Giro3D scenes are Z-up and OrbitControls measures
    // the polar angle from camera.up, so 90 degrees is exactly horizon level.
    controls.maxPolarAngle = Math.PI / 2 - 0.01;
    controls.screenSpacePanning = false;

    const raycaster = new THREE.Raycaster();
    const plane = new THREE.Plane();
    const normal = new THREE.Vector3(0, 0, 1);
    const ndc = new THREE.Vector2();
    const hit = new THREE.Vector3();

    const onDoubleClick = event => {
        if (!controls.enabled) return;

        const rect = domElement.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        ndc.set(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1
        );

        raycaster.setFromCamera(ndc, camera);
        // Ground plane through the current pivot: z = target.z.
        plane.set(normal, -controls.target.z);
        if (!raycaster.ray.intersectPlane(plane, hit)) return;

        controls.target.copy(hit);
        controls.update();
        if (onChange) onChange();
    };

    domElement.addEventListener('dblclick', onDoubleClick);

    const disposeControls = controls.dispose.bind(controls);
    controls.dispose = () => {
        domElement.removeEventListener('dblclick', onDoubleClick);
        disposeControls();
    };

    return controls;
}

export default createEarthControls;
