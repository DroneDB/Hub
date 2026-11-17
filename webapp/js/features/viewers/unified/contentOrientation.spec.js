/**
 * contentOrientation - unit tests for the tiled-content up axis correction.
 *
 * Geometry is built explicitly (not via three's primitive helpers) so each fixture's true surface
 * direction is stated in the test itself rather than inherited from a library convention.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { measureSurfaceNormal, alignContentUpAxis, geocentricPlacementInverse, localizeGeocentricContent, ORIENT } from './contentOrientation';

const libs = { THREE };
const UP = new THREE.Vector3(0, 0, 1);

/**
 * A 10x10 open sheet of triangles lying in the plane perpendicular to `normal`, wound so its
 * faces point along `normal` - the shape of an aerial mesh, which is what the detection targets.
 */
function sheet(normal, cells = 10) {
    const basis = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    const positions = [];
    const push = (x, y) => {
        const v = new THREE.Vector3(x, y, 0).applyQuaternion(basis);
        positions.push(v.x, v.y, v.z);
    };
    for (let i = 0; i < cells; i++) {
        for (let j = 0; j < cells; j++) {
            push(i, j); push(i + 1, j); push(i, j + 1);
            push(i + 1, j); push(i + 1, j + 1); push(i, j + 1);
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
}

/** A closed box: every face is cancelled by the one opposite, so there is no dominant direction. */
function closedBox() {
    const geometry = new THREE.BoxGeometry(2, 2, 2).toNonIndexed();
    return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
}

function tileset(child) {
    const root = new THREE.Group();
    root.add(child);
    root.updateMatrixWorld(true);
    return root;
}

describe('measureSurfaceNormal', () => {
    it('reports the area-weighted surface direction of an open mesh', () => {
        const root = tileset(sheet(new THREE.Vector3(0, -1, 0)));

        const measured = measureSurfaceNormal(libs, root);

        expect(measured.normal.distanceTo(new THREE.Vector3(0, -1, 0))).toBeLessThan(1e-6);
        // An open sheet's normals all agree, so coherence is maximal.
        expect(measured.coherence).toBeCloseTo(1, 6);
    });

    it('measures in the root local frame, so a rotated root does not skew the reading', () => {
        const root = tileset(sheet(new THREE.Vector3(0, 0, 1)));
        root.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
        root.updateMatrixWorld(true);

        // The child still points along +Z inside the root, whatever the root itself is doing.
        expect(measureSurfaceNormal(libs, root).normal.distanceTo(UP)).toBeLessThan(1e-6);
    });

    it('finds no dominant direction on a closed object', () => {
        const measured = measureSurfaceNormal(libs, tileset(closedBox()));

        expect(measured.coherence).toBeLessThan(ORIENT.minCoherence);
    });

    it('returns null when there is no triangle geometry (point cloud content)', () => {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 1], 3));
        const root = tileset(new THREE.Points(geometry, new THREE.PointsMaterial()));

        expect(measureSurfaceNormal(libs, root)).toBeNull();
    });

    it('handles indexed geometry', () => {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(
            [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 3));
        geometry.setIndex([0, 1, 2, 0, 2, 3]);
        const root = tileset(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()));

        expect(measureSurfaceNormal(libs, root).normal.distanceTo(UP)).toBeLessThan(1e-6);
    });
});

describe('alignContentUpAxis', () => {
    // The reported defect: an ODM mesh is authored Z-up, the tileset omits asset.gltfUpAxis, so
    // the renderer applies the glTF Y-up correction and leaves the model's vertical along -Y.
    it('stands up content the renderer tipped onto its side', () => {
        const mesh = sheet(new THREE.Vector3(0, -1, 0));
        const root = tileset(mesh);

        const rotation = alignContentUpAxis(libs, root, UP);

        expect(rotation).not.toBeNull();
        // The surface now faces the scene up axis in WORLD space, which is the whole point.
        const worldNormal = new THREE.Vector3(0, -1, 0).applyQuaternion(root.quaternion);
        expect(worldNormal.distanceTo(UP)).toBeLessThan(1e-6);
        // Rigid: a quarter turn about the third axis, so the model's horizontal bearing survives.
        const east = new THREE.Vector3(1, 0, 0).applyQuaternion(root.quaternion);
        expect(east.distanceTo(new THREE.Vector3(1, 0, 0))).toBeLessThan(1e-6);
        // The returned matrix is the same rotation, so a cached bounding box can follow along.
        const box = new THREE.Box3(new THREE.Vector3(0, -1, 0), new THREE.Vector3(10, 0, 10))
            .applyMatrix4(rotation);
        expect(box.min.toArray().every(Number.isFinite)).toBe(true);
        expect(box.getSize(new THREE.Vector3()).z).toBeCloseTo(1, 6);
    });

    it('leaves correctly authored Z-up content untouched', () => {
        const root = tileset(sheet(UP));
        const before = root.quaternion.clone();

        expect(alignContentUpAxis(libs, root, UP)).toBeNull();
        expect(root.quaternion.angleTo(before)).toBe(0);
    });

    it('leaves closed objects untouched (no reliable up axis to infer)', () => {
        const root = tileset(closedBox());
        const before = root.quaternion.clone();

        expect(alignContentUpAxis(libs, root, UP)).toBeNull();
        expect(root.quaternion.angleTo(before)).toBe(0);
    });

    it('snaps to the nearest axis instead of levelling real terrain slope', () => {
        // A sheet tilted 12 deg off vertical: a hillside, not a mis-oriented model.
        const tilted = new THREE.Vector3(0, 0, 1)
            .applyAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(12));
        const root = tileset(sheet(tilted));

        // Already closest to +Z, so nothing is applied - the slope is preserved, not flattened.
        expect(alignContentUpAxis(libs, root, UP)).toBeNull();
    });

    it('ignores content whose dominant direction is not close to any axis', () => {
        const diagonal = new THREE.Vector3(1, 1, 1).normalize();
        const root = tileset(sheet(diagonal));

        expect(alignContentUpAxis(libs, root, UP)).toBeNull();
    });

    it('aligns to the scene up axis it is given, not to world Z', () => {
        const root = tileset(sheet(UP));
        const globeUp = new THREE.Vector3(0, 1, 0);

        const rotation = alignContentUpAxis(libs, root, globeUp);

        expect(rotation).not.toBeNull();
        const worldNormal = UP.clone().applyQuaternion(root.quaternion);
        expect(worldNormal.distanceTo(globeUp)).toBeLessThan(1e-6);
    });
});

/**
 * A closed 2 m box with one extra panel facing `normal` (a refrigerator: a closed cabinet whose glass door is a
 * second layer on its front): most of its normals cancel, the panel's do not.
 */
function boxWithPanel(normal, side = 1.4) {
    const root = new THREE.Group();
    root.add(closedBox());
    const panel = sheet(normal, 1);
    panel.scale.setScalar(side);
    panel.position.copy(normal).multiplyScalar(1.01);
    root.add(panel);
    root.updateMatrixWorld(true);
    return root;
}

describe('a closed object with one large panel', () => {
    it('measures well below the coherence of an aerial mesh', () => {
        const measured = measureSurfaceNormal(libs, boxWithPanel(new THREE.Vector3(0, -1, 0)));
        // 1.96 m2 of panel over 24 m2 of box: about 0.075, as the refrigerator of the visual check
        expect(measured.coherence).toBeGreaterThan(0.05);
        expect(measured.coherence).toBeLessThan(ORIENT.minCoherence);
    });

    it('is not laid on its back: the panel is not taken for the ground', () => {
        const root = boxWithPanel(new THREE.Vector3(0, -1, 0));
        expect(alignContentUpAxis(libs, root, UP)).toBeNull();
        expect(root.quaternion.angleTo(new THREE.Quaternion())).toBe(0);
    });
});

// The root transform Obj2Tiles writes for the georeferenced ODM mesh of the visual check (EPSG:32617, near 41 deg N):
// local east-north-up to Earth-centred coordinates, column-major
const ENU_TO_ECEF = [
    0.9895365974240738, 0.144282092992812, 0, 0,
    -0.09508711820781401, 0.6521404109026098, 0.7521112447096563, 0,
    0.10851618455013821, -0.7442416019743783, 0.6590361716789842, 0,
    693139.4980681655, -4753790.898311776, 4181366.8952291664, 1
];

/** Terrain (a Z-up sheet in its local frame) placed on the Earth by the root transform, as the tile renderer does. */
function placedTerrain() {
    const root = new THREE.Group();
    const group = new THREE.Group();
    group.matrixAutoUpdate = false;
    group.matrix.fromArray(ENU_TO_ECEF);
    group.add(sheet(UP));
    root.add(group);
    root.updateMatrixWorld(true);
    return root;
}

describe('geocentricPlacementInverse', () => {
    it('undoes a root transform that places the content on the Earth', () => {
        const inverse = geocentricPlacementInverse(libs, ENU_TO_ECEF);
        const local = new THREE.Vector3(3, 4, 5);
        const back = local.clone().applyMatrix4(new THREE.Matrix4().fromArray(ENU_TO_ECEF)).applyMatrix4(inverse);
        expect(back.distanceTo(local)).toBeLessThan(1e-6);
    });

    it.each([
        ['no transform', undefined],
        ['the identity of a model in local coordinates', [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]],
        ['a local offset of a few km', [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2500, -800, 30, 1]],
        ['UTM coordinates (half a million metres east, millions north)', [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 500000, 4500000, 0, 1]],
        ['a matrix that is not 16 numbers', [1, 2, 3]],
        ['a matrix with NaN', [...ENU_TO_ECEF.slice(0, 12), NaN, 0, 0, 1]]
    ])('leaves %s alone', (_, transform) => {
        expect(geocentricPlacementInverse(libs, transform)).toBeNull();
    });
});

describe('localizeGeocentricContent', () => {
    it('brings georeferenced terrain back to its own frame, Z-up, where it is not tilted by its latitude', () => {
        const root = placedTerrain();
        // On the Earth the terrain faces the ellipsoid normal, about 49 deg off the scene up: too far from any axis
        // for the up detection, so it showed edge-on
        expect(measureSurfaceNormal(libs, root).normal.dot(UP)).toBeLessThan(0.8);

        const applied = localizeGeocentricContent(libs, root, ENU_TO_ECEF);

        expect(applied).not.toBeNull();
        const world = new THREE.Vector3(0, 0, 1).transformDirection(root.children[0].children[0].matrixWorld);
        expect(world.distanceTo(UP)).toBeLessThan(1e-6);
        // Its corner (0, 0) is at the origin of the scene again, not millions of metres away
        const corner = new THREE.Vector3().applyMatrix4(root.children[0].children[0].matrixWorld);
        expect(corner.length()).toBeLessThan(1e-3);
        // Upright already: the up detection has nothing left to turn
        expect(alignContentUpAxis(libs, root, UP)).toBeNull();
    });

    it('does nothing to a tileset in local coordinates', () => {
        const root = tileset(sheet(UP));
        expect(localizeGeocentricContent(libs, root, undefined)).toBeNull();
        expect(root.matrix.equals(new THREE.Matrix4())).toBe(true);
    });

    it('lets the up detection turn a localized model about the scene origin, its position with it', () => {
        const root = tileset(sheet(new THREE.Vector3(0, -1, 0)));
        root.position.set(0, 0, -10);
        root.updateMatrixWorld(true);

        const rotation = alignContentUpAxis(libs, root, UP);

        expect(rotation).not.toBeNull();
        expect(root.position.distanceTo(new THREE.Vector3(0, 0, -10).applyMatrix4(rotation))).toBeLessThan(1e-6);
    });
});
