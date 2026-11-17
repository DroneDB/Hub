import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CameraRig, FRAMING, framingOf, tiltUp } from './cameraRig';

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
    it('keeps the far plane past every splat when it frames only the core of the scene', () => {
        const { rig, camera } = makeRig();
        const everything = new THREE.Box3(new THREE.Vector3(-800, -800, -800), new THREE.Vector3(800, 800, 800));
        rig.frame(unitBox, identity, FRAMING.IMMERSIVE, everything);
        const target = new THREE.Vector3(0, 0, 0);
        // The camera looks at the core, close
        expect(camera.position.distanceTo(target)).toBeLessThan(5);
        // The farthest corner of all the splats is in front of the far plane
        expect(camera.far).toBeGreaterThan(camera.position.distanceTo(everything.max) + 1);
        // The navigation is scaled to the core, not to the floaters
        expect(rig.boundsDiagonal).toBeCloseTo(unitBox.getSize(new THREE.Vector3()).length(), 6);
    });

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

describe('frame of a georeferenced scene', () => {
    // A flat site, as a georeferenced splat is: wide, little relief, turned Z-up to Y-up
    const site = new THREE.Box3(new THREE.Vector3(-75, -60, 140), new THREE.Vector3(75, 60, 180));
    const zUp = new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2);
    const forward = camera => new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);

    it('is the overview; any other scene is framed from inside', () => {
        expect(framingOf({ georeferenced: true })).toBe(FRAMING.OVERVIEW);
        expect(framingOf({ georeferenced: false })).toBe(FRAMING.IMMERSIVE);
        expect(framingOf({})).toBe(FRAMING.IMMERSIVE);
    });

    it('looks down at the centre from 45 degrees above its horizon, from outside the site', () => {
        const { rig, camera, controls } = makeRig();
        rig.frame(site, zUp, FRAMING.OVERVIEW);
        const center = site.getCenter(new THREE.Vector3()).applyQuaternion(zUp);
        expect(controls.target.distanceTo(center)).toBeLessThan(1e-6);
        const offset = camera.position.clone().sub(center);
        // Above the whole site, not at the height of its middle among the splats
        expect(offset.dot(rig.sceneUp)).toBeGreaterThan(20 + 1);
        expect(offset.angleTo(rig.sceneUp)).toBeCloseTo(Math.PI / 4, 6);
        expect(offset.length()).toBeCloseTo(1.1 * 75 / Math.sin(THREE.MathUtils.degToRad(30)), 6);
        expect(forward(camera).dot(offset.clone().normalize())).toBeCloseTo(-1, 6);
        expect(rig.pitch).toBeCloseTo(-Math.PI / 4, 6);
    });

    it('keeps its height above the site while the presentation orbits', () => {
        const { rig, camera, controls } = makeRig();
        rig.frame(site, zUp, FRAMING.OVERVIEW);
        const height = () => camera.position.clone().sub(controls.target).dot(rig.sceneUp);
        const start = height();
        controls.autoRotate = true;
        for (let i = 0; i < 50; i++) rig.updateControls(0.1);
        expect(height()).toBeCloseTo(start, 4);
        expect(start).toBeGreaterThan(20);
    });

    it('has a view direction off the scene up also when the scene up is +Z', () => {
        for (const framing of [FRAMING.IMMERSIVE, FRAMING.OVERVIEW]) {
            const { rig, camera } = makeRig();
            rig.setUp(new THREE.Vector3(0, 0, 1));
            rig.frame(unitBox, identity, framing);
            expect(camera.quaternion.toArray().every(Number.isFinite)).toBe(true);
            expect(Math.abs(forward(camera).dot(rig.sceneUp))).toBeLessThan(0.75);
            // Level about the scene up: no roll
            const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
            expect(Math.abs(right.dot(rig.sceneUp))).toBeLessThan(1e-9);
        }
    });

    it('leaves the level framing of a Y-up scene as it was: on +Z of the centre', () => {
        const { rig, camera, controls } = makeRig();
        rig.frame(unitBox, identity, FRAMING.IMMERSIVE);
        expect(camera.position.clone().sub(controls.target).normalize().distanceTo(new THREE.Vector3(0, 0, 1))).toBeLessThan(1e-9);
        expect(rig.pitch).toBeCloseTo(0, 9);
    });
});

describe('frame of the core the build found', () => {
    // A core twice as long along X as along Z, 2 high, Y-up, about (10, 1, -5)
    const core = new THREE.Box3(new THREE.Vector3(6, 0, -7), new THREE.Vector3(14, 2, -3));
    const center = core.getCenter(new THREE.Vector3());
    const forward = camera => new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    // The angle of a direction above the horizon of the scene up, and about it from +Z towards +X
    const elevation = (rig, v) => THREE.MathUtils.radToDeg(Math.asin(v.clone().normalize().dot(rig.sceneUp)));
    const azimuth = v => THREE.MathUtils.radToDeg(Math.atan2(v.x, v.z));

    it('frames an object whole from outside, a little above it, in three-quarter view, orbiting its centre', () => {
        expect(framingOf({ kind: 'object' })).toBe(FRAMING.OBJECT);
        const { rig, camera, controls } = makeRig();
        rig.frame(core, identity, FRAMING.OBJECT, core, { faceBox: true });
        expect(controls.target.distanceTo(center)).toBeLessThan(1e-6);
        const offset = camera.position.clone().sub(center);
        // Outside the object, far enough for it all to be in view
        expect(core.containsPoint(camera.position)).toBe(false);
        expect(offset.length()).toBeCloseTo(1.15 * 4 / Math.sin(THREE.MathUtils.degToRad(30)), 6);
        expect(elevation(rig, offset)).toBeCloseTo(35, 6);
        // From its narrow side (+Z) turned 35 degrees towards its long side (+X)
        expect(azimuth(offset)).toBeCloseTo(35, 6);
        expect(forward(camera).dot(offset.clone().normalize())).toBeCloseTo(-1, 6);
        // The orbit goes round the object
        controls.autoRotate = true;
        for (let i = 0; i < 30; i++) rig.updateControls(0.1);
        expect(camera.position.distanceTo(center)).toBeCloseTo(offset.length(), 4);
    });

    it('frames a room from high in a corner of its core, looking across it at its centre, a little down', () => {
        expect(framingOf({ kind: 'scene', georeferenced: false })).toBe(FRAMING.IMMERSIVE);
        const { rig, camera, controls } = makeRig();
        rig.frame(core, identity, FRAMING.IMMERSIVE, core, { faceBox: true });
        // 80 % of the way out to a corner of the core (8 x 4 on the horizon), at 75 % of its height (2)
        expect(Math.abs(camera.position.x - center.x)).toBeCloseTo(0.8 * 4, 6);
        expect(Math.abs(camera.position.z - center.z)).toBeCloseTo(0.8 * 2, 6);
        expect(camera.position.y).toBeCloseTo(1.5, 6);
        expect(core.containsPoint(camera.position)).toBe(true);
        // It looks at a point 10 % of the height below the centre: down into the room, level about the up
        const target = center.clone().addScaledVector(rig.sceneUp, -0.2);
        expect(controls.target.distanceTo(target)).toBeLessThan(1e-6);
        expect(forward(camera).dot(target.clone().sub(camera.position).normalize())).toBeCloseTo(1, 6);
        expect(rig.pitch).toBeLessThan(0);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        expect(Math.abs(right.dot(rig.sceneUp))).toBeLessThan(1e-9);
    });

    it('stands in the least crowded corner of a room', () => {
        const { rig, camera } = makeRig();
        // The corners on the -X side are full of splats (a wall of shelves)
        const crowding = ([x]) => (x < 10 ? 5 : 0);
        rig.frame(core, identity, FRAMING.IMMERSIVE, core, { faceBox: true, crowding });
        expect(camera.position.x).toBeGreaterThan(center.x + 3);
    });

    it('stands in the corner with a clear view when the camera is clear in every corner', () => {
        const { rig, camera } = makeRig();
        // Shelves stand in front of the corners on the -Z side, between them and the centre
        const crowding = ([x, , z]) => (z < -5.5 && z > -6.5 && Math.abs(x - 10) < 3 ? 5 : 0);
        rig.frame(core, identity, FRAMING.IMMERSIVE, core, { faceBox: true, crowding });
        expect(camera.position.z).toBeGreaterThan(center.z + 1);
    });

    it('steps out of the splats towards the middle of the room when every corner is crowded', () => {
        const { rig, camera } = makeRig();
        // Crowded farther than 1 from the middle of the core on the horizon
        const crowding = ([x, , z]) => (Math.hypot(x - 10, z + 5) > 1 ? 1 : 0);
        rig.frame(core, identity, FRAMING.IMMERSIVE, core, { faceBox: true, crowding });
        expect(Math.hypot(camera.position.x - 10, camera.position.z + 5)).toBeLessThanOrEqual(1);
        expect(camera.position.y).toBeCloseTo(1.5, 6);
        // It gives up after its steps rather than end in the middle when nothing is clear
        const { rig: stuck, camera: stuckCamera } = makeRig();
        stuck.frame(core, identity, FRAMING.IMMERSIVE, core, { faceBox: true, crowding: () => 9 });
        const left = Math.hypot(stuckCamera.position.x - 10, stuckCamera.position.z + 5);
        expect(left).toBeCloseTo(Math.hypot(3.2, 1.6) * 0.85 ** 8, 6);
    });

    it('asks how crowded a corner is in the frame of the splat file', () => {
        // The core of a Z-up file turned to Y-up: the file point of each corner is the world point turned back
        const zUp = new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2);
        const file = new THREE.Box3(new THREE.Vector3(-4, -1, 0), new THREE.Vector3(4, 1, 1));
        const asked = [];
        const { rig, camera } = makeRig();
        rig.frame(file, zUp, FRAMING.IMMERSIVE, file, { faceBox: true, crowding: point => { asked.push(point); return 0; } });
        // Each corner, then the points of its line of sight
        const corners = asked.filter((_, i) => i % 4 === 0).slice(0, 4);
        expect(corners.length).toBe(4);
        // At 75 % of the height of the core in the file: z = 0.75
        corners.forEach(point => expect(point[2]).toBeCloseTo(0.75, 6));
        expect(camera.position.toArray().every(Number.isFinite)).toBe(true);
    });

    it('faces the sides of the core as the mesh orientation turns them', () => {
        // The core of a Z-up file turned to Y-up: its long side is still X, across the view of a site
        const zUp = new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2);
        const file = new THREE.Box3(new THREE.Vector3(-4, -1, 0), new THREE.Vector3(4, 1, 1));
        const { rig, camera, controls } = makeRig();
        rig.frame(file, zUp, FRAMING.OVERVIEW, file, { faceBox: true });
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        expect(Math.abs(right.x)).toBeCloseTo(1, 6);
        expect(controls.target.distanceTo(file.getCenter(new THREE.Vector3()).applyQuaternion(zUp))).toBeLessThan(1e-6);
    });

    it('keeps the kind of the build over the guess from the georeference', () => {
        expect(framingOf({ kind: 'object', georeferenced: true })).toBe(FRAMING.OBJECT);
        expect(framingOf({ kind: 'unknown', georeferenced: true })).toBe(FRAMING.OVERVIEW);
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
