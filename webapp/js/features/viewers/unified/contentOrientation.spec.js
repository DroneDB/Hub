/**
 * contentOrientation - unit tests for the tiled-content up axis correction.
 *
 * Geometry is built explicitly (not via three's primitive helpers) so each fixture's true surface
 * direction is stated in the test itself rather than inherited from a library convention.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { measureSurfaceNormal, alignContentUpAxis, ORIENT } from './contentOrientation';

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
