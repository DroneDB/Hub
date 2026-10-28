import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CameraRig, tiltUp } from './cameraRig';

function makeRig({ aspect = 2 } = {}) {
    const dom = document.createElement('canvas');
    const camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
    camera.position.set(0, 0, 4);
    const controls = new OrbitControls(camera, dom);
    controls.enableRotate = false;
    controls.enableDamping = false;
    return { rig: new CameraRig(THREE, camera, controls), camera, controls };
}
const unitBox = new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
const identity = new THREE.Quaternion();

describe('tiltUp', () => {
    it('is world up without a tilt, and turns with the pitch about X and the roll about Z', () => {
        expect(tiltUp(THREE, 0, 0).distanceTo(new THREE.Vector3(0, 1, 0))).toBeLessThan(1e-9);
        // Pitch 90 degrees lays up along +Z; roll 90 degrees then lays +Y along -X
        expect(tiltUp(THREE, 0, 90).distanceTo(new THREE.Vector3(0, 0, 1))).toBeLessThan(1e-9);
        expect(tiltUp(THREE, 90, 0).distanceTo(new THREE.Vector3(-1, 0, 0))).toBeLessThan(1e-9);
    });
});

describe('frame', () => {
    it('stands back by the distance that fits the scene sphere to the narrower side of the view', () => {
        const { rig, camera } = makeRig({ aspect: 2 });
        rig.frame(unitBox, identity);
        // Landscape: the vertical field of view limits; radius 1, margin 0.4
        const expected = (1 / Math.sin(THREE.MathUtils.degToRad(30))) * 0.4;
        expect(camera.position.z).toBeCloseTo(expected, 6);
        expect(rig.lookDist).toBeCloseTo(expected, 6);
    });

    it('stands further back for a portrait view, where the horizontal field of view limits', () => {
        const landscape = makeRig({ aspect: 2 });
        landscape.rig.frame(unitBox, identity);
        const portrait = makeRig({ aspect: 0.5 });
        portrait.rig.frame(unitBox, identity);
        expect(portrait.camera.position.z).toBeGreaterThan(landscape.camera.position.z * 1.5);
    });

    it('looks at the centre of the box turned by the mesh orientation, and sizes the scene', () => {
        const { rig, camera, controls } = makeRig();
        const box = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(2, 4, 6));
        const flip = new THREE.Quaternion(1, 0, 0, 0);
        rig.frame(box, flip);
        // (1, 2, 3) turned 180 degrees about X
        expect(controls.target.distanceTo(new THREE.Vector3(1, -2, -3))).toBeLessThan(1e-6);
        expect(rig.boundsDiagonal).toBeCloseTo(Math.hypot(2, 4, 6), 6);
        expect(camera.near).toBeLessThan(camera.far);
    });
});

describe('yaw and pitch', () => {
    it('round-trip through the camera orientation, upright and with a tilted scene up', () => {
        for (const [roll, pitch] of [[0, 0], [20, -35]]) {
            const { rig, camera } = makeRig();
            rig.setTilt(roll, pitch);
            rig.frame(unitBox, identity);
            rig.yaw = 0.7;
            rig.pitch = -0.3;
            rig.applyYawPitch();
            rig.yaw = rig.pitch = 0;
            rig.syncYawPitch();
            expect(rig.yaw).toBeCloseTo(0.7, 6);
            expect(rig.pitch).toBeCloseTo(-0.3, 6);
            expect(rig.targetYaw).toBeCloseTo(0.7, 6);
            // The look target is lookDist ahead of the camera
            const ahead = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).multiplyScalar(rig.lookDist).add(camera.position);
            expect(rig.controls.target.distanceTo(ahead)).toBeLessThan(1e-6);
        }
    });

    it('keep the horizon level about the scene up (no roll)', () => {
        const { rig, camera } = makeRig();
        rig.setTilt(0, 40);
        rig.yaw = 1;
        rig.pitch = 0.4;
        rig.applyYawPitch();
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        expect(Math.abs(right.dot(rig.sceneUp))).toBeLessThan(1e-9);
    });
});

describe('setUp', () => {
    it('normalises the direction and gives it to the camera and the scene', () => {
        const { rig, camera } = makeRig();
        rig.setUp(new THREE.Vector3(0, 0, 5));
        expect(rig.sceneUp.distanceTo(new THREE.Vector3(0, 0, 1))).toBeLessThan(1e-12);
        expect(camera.up.distanceTo(rig.sceneUp)).toBe(0);
    });

    it('makes OrbitControls turn about any up, not only a tilt of world Y', () => {
        for (const up of [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 2, 3)]) {
            const { rig, camera, controls } = makeRig();
            up.normalize();
            // A start off the axis and the target; the height along the up is kept while it orbits
            camera.position.set(3, -2, 1).projectOnPlane(up).addScaledVector(up, 1.5);
            controls.target.set(0, 0, 0);
            rig.setUp(up);
            controls.autoRotate = true;
            controls.update();
            const height = camera.position.dot(up);
            const radius = camera.position.clone().addScaledVector(up, -height).length();
            const before = camera.position.clone();
            for (let i = 0; i < 20; i++) controls.update();
            expect(camera.position.dot(up)).toBeCloseTo(height, 6);
            expect(camera.position.clone().addScaledVector(up, -camera.position.dot(up)).length()).toBeCloseTo(radius, 6);
            expect(camera.position.distanceTo(before)).toBeGreaterThan(0.05);
        }
    });

    it('frames and looks level about the new up', () => {
        const { rig, camera } = makeRig();
        rig.setUp(new THREE.Vector3(1, 0, 0));
        rig.frame(unitBox, identity);
        rig.yaw = 0.8;
        rig.pitch = 0.2;
        rig.applyYawPitch();
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        expect(Math.abs(right.dot(rig.sceneUp))).toBeLessThan(1e-9);
    });

    it('falls back to world up for a direction of no length', () => {
        const { rig, camera } = makeRig();
        rig.setUp(new THREE.Vector3(0, 0, 1));
        rig.setUp(new THREE.Vector3(0, 0, 0));
        expect(rig.sceneUp.toArray()).toEqual([0, 1, 0]);
        expect(camera.up.toArray()).toEqual([0, 1, 0]);
    });
});

describe('setTilt', () => {
    it('is setUp on the tilted world up', () => {
        const { rig } = makeRig();
        rig.setTilt(20, -35);
        expect(rig.sceneUp.distanceTo(tiltUp(THREE, 20, -35))).toBeLessThan(1e-12);
    });

    it('makes OrbitControls turn about the tilted up (it baked world Y in when it was built)', () => {
        const { rig, camera, controls } = makeRig();
        camera.position.set(5, 0, 0);
        controls.target.set(0, 0, 0);
        rig.setTilt(0, 90); // up is +Z
        controls.autoRotate = true;
        controls.update();
        const before = camera.position.clone();
        // Twenty auto-rotate steps: the camera must stay on its circle about Z, at its height
        for (let i = 0; i < 20; i++) controls.update();
        expect(camera.position.z).toBeCloseTo(before.z, 6);
        expect(Math.hypot(camera.position.x, camera.position.y)).toBeCloseTo(5, 6);
        expect(camera.position.distanceTo(before)).toBeGreaterThan(0.1);
    });

    it('leaves controls that keep no such rotation alone', () => {
        const camera = new THREE.PerspectiveCamera();
        const rig = new CameraRig(THREE, camera, { target: new THREE.Vector3(), update() {} });
        expect(() => rig.setTilt(10, 10)).not.toThrow();
        expect(camera.up.distanceTo(rig.sceneUp)).toBe(0);
    });
});

describe('updateControls', () => {
    it('turns the auto-rotate by the time that passed, not by the frames', () => {
        const turn = dts => {
            const { rig, camera, controls } = makeRig();
            camera.position.set(5, 0, 0);
            controls.autoRotate = true;
            controls.autoRotateSpeed = 2;
            dts.forEach(dt => rig.updateControls(dt));
            return Math.atan2(camera.position.z, camera.position.x);
        };
        const at60 = turn(Array(60).fill(1 / 60));
        const at30 = turn(Array(30).fill(1 / 30));
        const oneSecond = turn([1]);
        expect(at60).toBeCloseTo(oneSecond, 6);
        expect(at30).toBeCloseTo(oneSecond, 6);
        expect(Math.abs(oneSecond)).toBeGreaterThan(0.1);
    });
});

describe('setFov', () => {
    it('changes the field of view and the projection', () => {
        const { rig, camera } = makeRig();
        const before = camera.projectionMatrix.clone();
        rig.setFov(30);
        expect(camera.fov).toBe(30);
        expect(camera.projectionMatrix.equals(before)).toBe(false);
    });
});
