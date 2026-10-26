/**
 * Earth navigation of the splat viewer, Potree style: left-drag
 * (or one finger) grabs and pans the ground, right-drag orbits the pivot under the
 * pointer, the wheel and a pinch zoom toward the pointer. A marker shows the pivot.
 */
import { PRIMARY } from '@/libs/palette';

const ROTATE_SPEED = 0.005;
// Pitch stops ~5° from straight up/down so the view cannot flip over
const POLE = 0.996;

export class EarthControls {
    /**
     * @param {import('./cameraRig').CameraRig} rig
     * @param {any} canvas  the renderer's canvas
     * @param {any} scene   gets the pivot marker
     * @param {object} hooks
     * @param {() => boolean} hooks.enabled
     * @param {() => void} hooks.onInteract
     */
    constructor(rig, canvas, scene, { enabled, onInteract }) {
        const { THREE } = rig;
        this.rig = rig;
        this.canvas = canvas;
        this.scene = scene;
        this.enabled = enabled;
        this.onInteract = onInteract;
        this.pointers = new Map();
        this.gesture = null;   // null | 'pan' | 'rotate' | 'twofinger'
        this.pivot = null;
        this.camStart = null;
        this.targetStart = null;
        this.lastX = 0;
        this.lastY = 0;
        this.lastDist = 0;
        this.plane = new THREE.Plane();
        this._raycaster = new THREE.Raycaster();
        this._ray = new THREE.Ray();
        this._planeScratch = new THREE.Plane();
        this._v = [1, 2, 3, 4].map(() => new THREE.Vector3());
        this._q = [1, 2, 3].map(() => new THREE.Quaternion());

        // Pivot marker, drawn on top
        this.marker = new THREE.Mesh(
            new THREE.SphereGeometry(1, 16, 16),
            new THREE.MeshBasicMaterial({ color: PRIMARY[300], transparent: true, opacity: 0.9, depthTest: false, depthWrite: false })
        );
        this.marker.renderOrder = 999;
        this.marker.visible = false;
        scene.add(this.marker);

        this.handlers = {
            pointerdown: e => this.onPointerDown(e),
            pointermove: e => this.onPointerMove(e),
            pointerup: e => this.onPointerUp(e),
            pointercancel: e => this.onPointerUp(e)
        };
        this.onWheelBound = e => this.onWheel(e);
    }

    /** Registers the canvas listeners through `listen(target, type, fn, options)`. */
    attach(listen) {
        Object.entries(this.handlers).forEach(([type, fn]) => listen(this.canvas, type, fn));
        listen(this.canvas, 'wheel', this.onWheelBound, { passive: false });
    }

    /** Leaves earth mode: no gesture, no marker. */
    reset() {
        this.pointers.clear();
        this.gesture = null;
        this.marker.visible = false;
    }

    dispose() {
        this.reset();
        this.scene.remove(this.marker);
        this.marker.geometry.dispose();
        this.marker.material.dispose();
    }

    /**
     * Where the ray through a screen point meets `plane` (a new vector, or null). With
     * fromAnchor the ray starts at the gesture's start camera, so a pan stays stable.
     */
    screenToPlane(clientX, clientY, plane, fromAnchor) {
        const rect = this.canvas.getBoundingClientRect();
        const ndc = { x: ((clientX - rect.left) / (rect.width || 1)) * 2 - 1, y: -((clientY - rect.top) / (rect.height || 1)) * 2 + 1 };
        this._raycaster.setFromCamera(ndc, this.rig.camera);
        this._ray.direction.copy(this._raycaster.ray.direction);
        this._ray.origin.copy(fromAnchor && this.camStart ? this.camStart : this._raycaster.ray.origin);
        const hit = this._ray.intersectPlane(plane, this._v[0]);
        return hit ? hit.clone() : null;
    }

    // Ground plane through the look target; pivot = ground point under the pointer
    begin(clientX, clientY) {
        const { camera, controls, sceneUp } = this.rig;
        this.plane.setFromNormalAndCoplanarPoint(sceneUp, controls.target);
        this.camStart = camera.position.clone();
        this.targetStart = controls.target.clone();
        this.pivot = this.screenToPlane(clientX, clientY, this.plane, false) || controls.target.clone();
        this.lastX = clientX;
        this.lastY = clientY;
    }

    midpoint() {
        let x = 0, y = 0;
        this.pointers.forEach(p => { x += p.x; y += p.y; });
        const n = this.pointers.size || 1;
        return { x: x / n, y: y / n };
    }

    spread() {
        const [a, b] = [...this.pointers.values()];
        return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    }

    onPointerDown(e) {
        if (!this.enabled()) return;
        try { this.canvas.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        this.onInteract();
        if (this.pointers.size === 1) {
            // Right mouse button orbits; left button and one finger pan
            this.gesture = e.pointerType === 'mouse' && e.button === 2 ? 'rotate' : 'pan';
            this.begin(e.clientX, e.clientY);
        } else if (this.pointers.size === 2) {
            this.gesture = 'twofinger';
            const mid = this.midpoint();
            this.lastDist = this.spread();
            this.begin(mid.x, mid.y);
        }
        e.preventDefault();
    }

    onPointerMove(e) {
        if (!this.enabled() || !this.pointers.has(e.pointerId)) return;
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const one = this.pointers.size === 1;
        if (this.gesture === 'pan' && one) {
            this.pan(e.clientX, e.clientY);
        } else if (this.gesture === 'rotate' && one) {
            this.rotate(e.clientX - this.lastX, e.clientY - this.lastY);
            this.lastX = e.clientX;
            this.lastY = e.clientY;
        } else if (this.gesture === 'twofinger' && this.pointers.size >= 2) {
            const mid = this.midpoint();
            const dist = this.spread();
            this.rotate(mid.x - this.lastX, mid.y - this.lastY);
            if (this.lastDist > 0 && dist > 0) this.zoomToward(this.pivot, dist / this.lastDist - 1);
            this.lastX = mid.x;
            this.lastY = mid.y;
            this.lastDist = dist;
        }
        e.preventDefault();
    }

    onPointerUp(e) {
        if (!this.pointers.has(e.pointerId)) return;
        try { this.canvas.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
        this.pointers.delete(e.pointerId);
        if (this.pointers.size === 1) {
            // Two fingers down to one: a clean pan from the remaining finger
            this.gesture = 'pan';
            const p = this.pointers.values().next().value;
            this.begin(p.x, p.y);
        } else if (this.pointers.size === 0) {
            this.gesture = null;
            this.marker.visible = false;
        }
    }

    onWheel(e) {
        if (!this.enabled()) return;
        e.preventDefault();
        this.onInteract();
        const { controls, sceneUp } = this.rig;
        this._planeScratch.setFromNormalAndCoplanarPoint(sceneUp, controls.target);
        const point = this.screenToPlane(e.clientX, e.clientY, this._planeScratch, false) || controls.target.clone();
        this.zoomToward(point, (e.deltaY < 0 ? 1 : -1) * 0.15);
    }

    // Keeps the ground point grabbed at the start under the pointer
    pan(clientX, clientY) {
        const hit = this.screenToPlane(clientX, clientY, this.plane, true);
        if (!hit || !this.pivot || !this.camStart) return;
        const moved = this._v[1].subVectors(hit, this.pivot);
        this.rig.camera.position.copy(this.camStart).sub(moved);
        this.rig.controls.target.copy(this.targetStart).sub(moved);
        this.updateMarker();
    }

    // Orbits camera and target about the pivot: yaw about scene up, pitch about the view's right
    rotate(dx, dy) {
        const { camera, controls, sceneUp: up } = this.rig;
        const pivot = this.pivot;
        if (!pivot) return;
        const [v1, v2, v3, v4] = this._v;
        const [q1, q2, q3] = this._q;
        const yaw = -dx * ROTATE_SPEED;
        const fwd = v1.subVectors(controls.target, camera.position);
        if (fwd.lengthSq() < 1e-8) fwd.set(0, 0, -1);
        fwd.normalize();
        const side = v2.crossVectors(fwd, up);
        if (side.lengthSq() < 1e-8) side.set(1, 0, 0);
        side.normalize();

        const q = q3.copy(q1.setFromAxisAngle(up, yaw)).multiply(q2.setFromAxisAngle(side, -dy * ROTATE_SPEED));
        const offP = v3.subVectors(camera.position, pivot).applyQuaternion(q);
        const offT = v4.subVectors(controls.target, pivot).applyQuaternion(q);
        const newFwd = v1.copy(offT).sub(offP);
        if (newFwd.lengthSq() > 1e-12 && Math.abs(newFwd.normalize().dot(up)) > POLE) {
            // Too close to a pole: yaw only
            const qy = q1.setFromAxisAngle(up, yaw);
            offP.subVectors(camera.position, pivot).applyQuaternion(qy);
            offT.subVectors(controls.target, pivot).applyQuaternion(qy);
        }
        camera.position.copy(pivot).add(offP);
        controls.target.copy(pivot).add(offT);
        this.updateMarker();
    }

    // Dollies camera and target toward a point; amount > 0 moves closer
    zoomToward(point, amount) {
        if (!point || !amount) return;
        const { camera, controls } = this.rig;
        const toPoint = this._v[0].subVectors(point, camera.position);
        const distToPoint = toPoint.length();
        if (distToPoint < 1e-6) return;
        const dir = toPoint.multiplyScalar(1 / distToPoint);
        const distToTarget = camera.position.distanceTo(controls.target) || distToPoint;
        // A cursor near the horizon hits the ground very far away: bound the step by the target distance
        const ref = Math.min(distToPoint, distToTarget * 3);
        let step = Math.max(-ref * 0.4, Math.min(ref * 0.4, ref * amount));
        if (step > 0) step = Math.min(step, distToPoint * 0.9);
        camera.position.addScaledVector(dir, step);
        controls.target.addScaledVector(dir, step);
        this.updateMarker();
    }

    // The marker follows the pivot at a constant ~8 px radius
    updateMarker() {
        if (this.gesture && this.pivot) {
            this.marker.position.copy(this.pivot);
            this.marker.visible = true;
        }
        if (!this.marker.visible) return;
        const camera = this.rig.camera;
        const h = this.canvas.clientHeight || 1;
        const worldPerPixel = (2 * Math.tan((camera.fov * Math.PI) / 360) * camera.position.distanceTo(this.marker.position)) / h;
        this.marker.scale.setScalar(Math.max(worldPerPixel * 8, 1e-4));
    }
}
