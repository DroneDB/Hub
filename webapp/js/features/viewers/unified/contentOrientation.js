/**
 * contentOrientation - puts tiled mesh content the right way up in a flat scene.
 *
 * 3D Tiles content is glTF, and glTF is Y-up: a tileset that does not declare `asset.gltfUpAxis`
 * gets the spec default 'y', so the renderer rotates its content +90 deg about X to bring it into
 * the Z-up tileset frame. DroneDB's own model tilesets are built by Obj2Tiles from source meshes
 * that are already Z-up (ODM writes local ENU: X east, Y north, Z up) and are written out without
 * that declaration, so the renderer's correction tips them onto their side - the model's real
 * vertical ends up along world -Y. Everything downstream then reads wrong: a turntable rotation
 * about the scene up axis spins the model about an axis lying in its own ground plane (it tumbles
 * instead of turning), panning slides along a vertical plane, and the sun lights it from the side.
 *
 * The fix cannot be a blanket un-rotation: correctly authored Y-up tilesets arrive through the same
 * viewer path and must be left alone. So the up axis is measured from the geometry instead. Aerial
 * and terrain meshes are dominated by ground-facing surface, so the area-weighted mean triangle
 * normal points along their true vertical; it is snapped to the nearest signed axis (never applied
 * raw, which would level out real terrain slope) and only used when the evidence is unambiguous.
 * Closed objects, whose normals cancel out, yield no dominant direction and are left untouched.
 *
 * The correction is a rotation of the tileset's own Object3D - rigid, so it preserves every
 * distance and area the measurement tools report.
 */

const ORIENT = {
    // Triangles sampled per mesh. The mean normal converges long before this; the cap is what
    // keeps the pass cheap on dense meshes.
    maxTrianglesPerMesh: 4000,
    // |sum of normals| / sum of |normals|. A closed object tends to 0 (its normals cancel), an
    // open surface to 1. Terrain sits near 0.3 even when hilly, so this only rejects the genuinely
    // directionless case.
    minCoherence: 0.05,
    // How closely the mean normal must line up with a signed axis before it is trusted.
    minAxisDot: 0.8
};

/**
 * Measures the dominant surface direction of a subtree, expressed in `root`'s own local frame
 * (the frame `root.quaternion` acts on, so the result can be corrected by rotating `root`).
 *
 * @param libs - { THREE }.
 * @param root - Object3D whose mesh descendants are sampled.
 * @param options - overrides for ORIENT.
 * @returns { normal, coherence } with a unit normal, or null when there is no triangle geometry.
 */
export function measureSurfaceNormal(libs, root, options = {}) {
    const { THREE } = libs;
    const maxTriangles = options.maxTrianglesPerMesh || ORIENT.maxTrianglesPerMesh;

    root.updateMatrixWorld(true);
    const toLocal = new THREE.Matrix4().copy(root.matrixWorld).invert();

    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const ab = new THREE.Vector3(), ac = new THREE.Vector3(), cross = new THREE.Vector3();
    const sum = new THREE.Vector3();
    const matrix = new THREE.Matrix4();
    let area = 0;

    root.traverse(obj => {
        if (!obj.isMesh || !obj.geometry) return;
        const position = obj.geometry.attributes && obj.geometry.attributes.position;
        if (!position) return;

        const index = obj.geometry.index;
        const triangles = Math.floor((index ? index.count : position.count) / 3);
        if (triangles < 1) return;

        matrix.multiplyMatrices(toLocal, obj.matrixWorld);
        const step = Math.max(1, Math.ceil(triangles / maxTriangles));
        for (let t = 0; t < triangles; t += step) {
            const i = t * 3;
            const i0 = index ? index.getX(i) : i;
            const i1 = index ? index.getX(i + 1) : i + 1;
            const i2 = index ? index.getX(i + 2) : i + 2;
            a.fromBufferAttribute(position, i0).applyMatrix4(matrix);
            b.fromBufferAttribute(position, i1).applyMatrix4(matrix);
            c.fromBufferAttribute(position, i2).applyMatrix4(matrix);
            cross.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
            // |cross| is twice the triangle area, so summing the raw vectors weights each normal
            // by its area - large ground triangles outvote dense clutter.
            const magnitude = cross.length();
            if (magnitude === 0) continue;
            sum.add(cross);
            area += magnitude;
        }
    });

    if (area === 0) return null;
    const length = sum.length();
    return { normal: sum.divideScalar(length || 1), coherence: length / area };
}

/**
 * Rotates `root` so that the measured surface direction points along `up`, when the geometry says
 * so unambiguously. No-op for content that is already upright, for closed objects and for anything
 * whose dominant direction is not close to an axis.
 *
 * @param libs - { THREE }.
 * @param root - the tileset Object3D to correct in place.
 * @param up - the scene up axis to align to.
 * @param options - overrides for ORIENT.
 * @returns the applied rotation as a Matrix4 (to bring cached bounding boxes along), or null.
 */
export function alignContentUpAxis(libs, root, up, options = {}) {
    const { THREE } = libs;
    const measured = measureSurfaceNormal(libs, root, options);
    if (!measured) return null;
    if (measured.coherence < (options.minCoherence || ORIENT.minCoherence)) return null;

    const minAxisDot = options.minAxisDot || ORIENT.minAxisDot;
    const axes = [
        new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
        new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0),
        new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)
    ];
    let axis = null;
    let best = minAxisDot;
    for (const candidate of axes) {
        const dot = measured.normal.dot(candidate);
        if (dot > best) { best = dot; axis = candidate; }
    }
    if (!axis) return null;

    const target = up.clone().normalize();
    if (axis.dot(target) > 0.999) return null; // already upright

    // Shortest arc between two axes is a quarter or half turn about a third axis, so the model's
    // horizontal bearing survives the correction.
    const quaternion = new THREE.Quaternion().setFromUnitVectors(axis, target);
    root.quaternion.premultiply(quaternion);
    root.updateMatrixWorld(true);
    return new THREE.Matrix4().makeRotationFromQuaternion(quaternion);
}

export { ORIENT };
