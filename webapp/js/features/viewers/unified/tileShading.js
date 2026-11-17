/**
 * tileShading - shading for model tiles that have no texture and no vertex colours.
 *
 * The lights of the 3D viewer are tuned for photogrammetry: its textures carry the light of the
 * day they were shot, so a strong ambient and sky light shows them close to their own colours. A
 * mesh without a texture or vertex colours (a laser scan, an STL, a CAD part) has nothing but its
 * shading to show its shape, and under that ambient light every face comes out the same grey: a
 * flat silhouette. The tiles Obj2Tiles writes also carry no normals.
 *
 * Such a mesh gets a clay material instead: a matcap (a sphere lit from above-left, sampled by
 * the direction of each face towards the camera), so its shape reads whatever the light settings.
 * The base colour of its material is kept. The normals it needs are computed on load, on the CPU:
 * the flat shading three.js falls back to for glTF without normals takes them from screen-space
 * derivatives, which some GPU drivers return as zero (the faces then all get the same colour). The
 * vertices of the tiles are welded, so the averaged vertex normals of a faceted part (a cube, a
 * CAD part) would round off its edges: a mesh whose faces mostly turn away from the averaged
 * normals of their corners gets one normal per face instead.
 */

// Matcap of the clay material: a light from above-left and in front, a soft ambient floor, and
// a faint rim so the silhouette stays apart from a dark background.
const CLAY = {
    size: 64,
    light: [-0.45, 0.55, 0.7],
    ambient: 0.3,
    diffuse: 0.7,
    rim: 0.12
};

/**
 * The RGBA pixels of the clay matcap, row 0 at the bottom (the WebGL texture order): the grey of a
 * unit sphere seen from the front, at each pixel of `size` x `size`. Outside the sphere the pixels
 * repeat its edge.
 *
 * @param {number} [size]
 * @returns {Uint8Array}
 */
export function clayMatcapPixels(size = CLAY.size) {
    const pixels = new Uint8Array(size * size * 4);
    const [lx, ly, lz] = CLAY.light;
    const lightLength = Math.hypot(lx, ly, lz);
    for (let row = 0; row < size; row++) {
        for (let column = 0; column < size; column++) {
            let x = ((column + 0.5) / size) * 2 - 1;
            let y = ((row + 0.5) / size) * 2 - 1;
            const r = Math.hypot(x, y);
            if (r > 1) { x /= r; y /= r; }
            const z = Math.sqrt(Math.max(0, 1 - x * x - y * y));
            const lambert = Math.max(0, (x * lx + y * ly + z * lz) / lightLength);
            const rim = Math.pow(1 - z, 3);
            const grey = Math.min(1, CLAY.ambient + CLAY.diffuse * lambert + CLAY.rim * rim);
            const value = Math.round(grey * 255);
            const i = (row * size + column) * 4;
            pixels[i] = pixels[i + 1] = pixels[i + 2] = value;
            pixels[i + 3] = 255;
        }
    }
    return pixels;
}

/**
 * Whether a tile mesh has nothing but its shading to show its shape: triangles, no texture and
 * no vertex colours.
 *
 * @param {any} object - an Object3D of a tile.
 */
export function needsClayShading(object) {
    if (!object || !object.isMesh || !object.geometry || Array.isArray(object.material)) return false;
    const material = object.material;
    if (!material || material.map || material.isMeshMatcapMaterial) return false;
    const attributes = object.geometry.attributes || {};
    return !!attributes.position && !attributes.color;
}

// A corner whose averaged normal turns more than this from its face is on a hard edge
const HARD_EDGE_COS = Math.cos(Math.PI / 4);
// Share of corners on hard edges above which a mesh is shaded per face (a cube has them all)
const FACETED_SHARE = 0.2;

/**
 * The share of the triangle corners of an indexed geometry whose vertex normal turns more than
 * 45 degrees from the normal of the triangle: near 0 for a smooth surface (a scan), up to 1 for a
 * faceted part whose corners are shared by faces at right angles.
 *
 * @param {ArrayLike<number>} positions - x, y, z per vertex.
 * @param {ArrayLike<number>} normals - the averaged unit normal of each vertex.
 * @param {ArrayLike<number>} index - three vertex indices per triangle.
 * @returns {number}
 */
export function hardCornerShare(positions, normals, index) {
    let corners = 0;
    let hard = 0;
    for (let t = 0; t + 2 < index.length; t += 3) {
        const a = index[t] * 3, b = index[t + 1] * 3, c = index[t + 2] * 3;
        const abx = positions[b] - positions[a], aby = positions[b + 1] - positions[a + 1], abz = positions[b + 2] - positions[a + 2];
        const acx = positions[c] - positions[a], acy = positions[c + 1] - positions[a + 1], acz = positions[c + 2] - positions[a + 2];
        const nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx;
        const length = Math.hypot(nx, ny, nz);
        if (length === 0) continue;
        for (const v of [a, b, c]) {
            corners++;
            const dot = (nx * normals[v] + ny * normals[v + 1] + nz * normals[v + 2]) / length;
            if (dot < HARD_EDGE_COS) hard++;
        }
    }
    return corners ? hard / corners : 0;
}

/**
 * The geometry of a tile mesh with the normals its shading needs: its own when it has them,
 * else averaged vertex normals, or one normal per face (a new, non-indexed geometry) for a faceted
 * mesh (hardCornerShare above 0.2).
 *
 * @param {any} geometry - a BufferGeometry.
 * @returns {any} the geometry to draw: the same one, or a new one.
 */
export function withShadingNormals(geometry) {
    if (geometry.attributes.normal) return geometry;
    geometry.computeVertexNormals();
    if (!geometry.index) return geometry; // one normal per face already
    const share = hardCornerShare(geometry.attributes.position.array, geometry.attributes.normal.array, geometry.index.array);
    if (share <= FACETED_SHARE) return geometry;
    const faceted = geometry.toNonIndexed();
    faceted.computeVertexNormals();
    return faceted;
}

/**
 * The clay matcap texture shared by the tiles of a scene.
 * @param {{ THREE: any }} libs
 */
export function createClayMatcap(libs) {
    const { THREE } = libs;
    const texture = new THREE.DataTexture(clayMatcapPixels(CLAY.size), CLAY.size, CLAY.size, THREE.RGBAFormat);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
}

/**
 * Gives every mesh of a loaded tile that needs it (needsClayShading) the clay material, with the
 * base colour, opacity and sides of its own material, and the normals it needs (withShadingNormals).
 *
 * @param {{ THREE: any }} libs
 * @param {any} root - the scene of a loaded tile.
 * @param {any} matcap - the texture of createClayMatcap.
 * @returns {number} the meshes changed.
 */
export function applyClayShading(libs, root, matcap) {
    const { THREE } = libs;
    let changed = 0;
    root.traverse(object => {
        if (!needsClayShading(object)) return;
        const source = object.material;
        const geometry = withShadingNormals(object.geometry);
        if (geometry !== object.geometry) {
            object.geometry.dispose();
            object.geometry = geometry;
        }
        const clay = new THREE.MeshMatcapMaterial({
            name: source.name,
            color: source.color ? source.color.clone() : new THREE.Color(0xffffff),
            matcap,
            side: source.side,
            transparent: source.transparent,
            opacity: source.opacity,
            alphaTest: source.alphaTest
        });
        object.material = clay;
        source.dispose();
        changed++;
    });
    return changed;
}
