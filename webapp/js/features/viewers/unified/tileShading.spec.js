/**
 * tileShading: a model tile without texture or vertex colours gets the clay material, whose shading does not depend on
 * the lights of the scene nor on the screen-space derivatives of the GPU, with the normals it needs computed on load:
 * averaged for a smooth surface, one per face for a faceted part. three.js is the real thing.
 */
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import {
    clayMatcapPixels, needsClayShading, hardCornerShare, withShadingNormals, applyClayShading, createClayMatcap,
    showsOwnColours, topModelTiles, ModelShading
} from './tileShading';
import { UnifiedScene } from './unifiedScene';
import { TilesRenderer } from '3d-tiles-renderer';

const libs = { THREE };

/** A welded geometry as the tiles carry it: indexed, positions only (no normals). */
function welded(geometry) {
    for (const name of Object.keys(geometry.attributes)) if (name !== 'position') geometry.deleteAttribute(name);
    return geometry;
}

/** A unit cube of 8 shared corners (as a welded STL or an OBJ cube without normals). */
function weldedCube() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
        -1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1,
        -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1
    ], 3));
    geometry.setIndex([
        0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4,
        2, 3, 7, 2, 7, 6, 1, 2, 6, 1, 6, 5, 3, 0, 4, 3, 4, 7
    ]);
    return geometry;
}

const value = (pixels, size, column, row) => pixels[(row * size + column) * 4];

describe('clayMatcapPixels', () => {
    it('is a grey sphere lit from above-left: brighter there than below-right, never black', () => {
        const size = 32;
        const pixels = clayMatcapPixels(size);
        expect(pixels).toHaveLength(size * size * 4);
        // Row 0 is the bottom of the texture
        const upperLeft = value(pixels, size, 8, 24);
        const lowerRight = value(pixels, size, 24, 8);
        expect(upperLeft).toBeGreaterThan(lowerRight + 60);
        expect(Math.min(...pixels.filter((_, i) => i % 4 === 0))).toBeGreaterThan(40);
        // Grey: the three channels agree, opaque
        expect(pixels[0]).toBe(pixels[1]);
        expect(pixels[1]).toBe(pixels[2]);
        expect(pixels[3]).toBe(255);
    });
});

describe('needsClayShading', () => {
    const mesh = (geometry, material) => new THREE.Mesh(geometry, material);
    const plain = () => welded(new THREE.SphereGeometry(1, 8, 6));

    it('is true for a mesh without texture or vertex colours', () => {
        expect(needsClayShading(mesh(plain(), new THREE.MeshStandardMaterial()))).toBe(true);
    });

    it('is false for a textured mesh: photogrammetry keeps its texture and the lights of the scene', () => {
        expect(needsClayShading(mesh(plain(), new THREE.MeshStandardMaterial({ map: new THREE.Texture() })))).toBe(false);
    });

    it('is false for a mesh with vertex colours', () => {
        const geometry = plain();
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count * 3), 3));
        expect(needsClayShading(mesh(geometry, new THREE.MeshStandardMaterial()))).toBe(false);
    });

    it('is false for points, lines and a mesh already in clay', () => {
        expect(needsClayShading(new THREE.Points(plain(), new THREE.PointsMaterial()))).toBe(false);
        expect(needsClayShading(new THREE.LineSegments(plain(), new THREE.LineBasicMaterial()))).toBe(false);
        expect(needsClayShading(mesh(plain(), new THREE.MeshMatcapMaterial()))).toBe(false);
    });
});

describe('withShadingNormals', () => {
    it('gives a smooth surface averaged normals and keeps it indexed', () => {
        const sphere = welded(new THREE.SphereGeometry(1, 32, 16));
        const shaded = withShadingNormals(sphere);
        expect(shaded).toBe(sphere);
        expect(shaded.index).not.toBeNull();
        expect(shaded.attributes.normal.count).toBe(shaded.attributes.position.count);
        expect(hardCornerShare(shaded.attributes.position.array, shaded.attributes.normal.array, shaded.index.array)).toBeLessThan(0.05);
    });

    it('gives a welded cube one normal per face, so its edges stay sharp', () => {
        const cube = weldedCube();
        cube.computeVertexNormals();
        // Most corners of a welded cube turn far from their faces (the averaged normal points along a diagonal)
        expect(hardCornerShare(cube.attributes.position.array, cube.attributes.normal.array, cube.index.array)).toBeGreaterThan(0.5);
        cube.deleteAttribute('normal');

        const shaded = withShadingNormals(cube);

        expect(shaded).not.toBe(cube);
        expect(shaded.index).toBeNull();
        const normals = shaded.attributes.normal;
        // The three corners of each triangle share the normal of its face, an axis
        for (let i = 0; i < normals.count; i++) {
            const n = new THREE.Vector3().fromBufferAttribute(normals, i);
            expect(Math.max(Math.abs(n.x), Math.abs(n.y), Math.abs(n.z))).toBeCloseTo(1, 6);
        }
    });

    it('keeps the normals a tile has', () => {
        const sphere = new THREE.SphereGeometry(1, 8, 6);
        const normals = sphere.attributes.normal;
        expect(withShadingNormals(sphere).attributes.normal).toBe(normals);
    });
});

describe('applyClayShading', () => {
    it('gives the untextured meshes of a tile the clay matcap with their colour and normals, and leaves the textured ones', () => {
        const root = new THREE.Group();
        const plain = new THREE.Mesh(welded(new THREE.SphereGeometry(1, 16, 8)), new THREE.MeshStandardMaterial({ color: 0x336699, side: THREE.DoubleSide }));
        const textured = new THREE.Mesh(welded(new THREE.SphereGeometry(1, 16, 8)), new THREE.MeshStandardMaterial({ map: new THREE.Texture() }));
        root.add(plain, textured);
        const matcap = createClayMatcap(libs);

        expect(applyClayShading(libs, root, matcap)).toBe(1);

        expect(plain.material.isMeshMatcapMaterial).toBe(true);
        expect(plain.material.matcap).toBe(matcap);
        expect(plain.material.color.getHex()).toBe(0x336699);
        expect(plain.material.side).toBe(THREE.DoubleSide);
        // CPU normals, not the derivatives of flat shading
        expect(plain.material.flatShading).toBe(false);
        expect(plain.geometry.attributes.normal).toBeDefined();
        expect(textured.material.isMeshStandardMaterial).toBe(true);
        // A second pass (the tile shown again) changes nothing
        expect(applyClayShading(libs, root, matcap)).toBe(0);
    });
});

/** The scene of a loaded tile: one mesh, textured, with vertex colours, or plain. */
function tileScene(kind = 'plain') {
    const geometry = welded(new THREE.SphereGeometry(1, 8, 6));
    if (kind === 'vertexColours') geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count * 3), 3));
    const material = new THREE.MeshStandardMaterial(kind === 'textured' ? { map: new THREE.Texture() } : { color: 0xffffff });
    const scene = new THREE.Group();
    scene.add(new THREE.Mesh(geometry, material));
    return scene;
}

/** A tile of 3d-tiles-renderer: its model (or a link to another tileset, or nothing) and its children. */
function tile(content, children = []) {
    const node = { internal: { hasRenderableContent: content === 'model', hasUnrenderableContent: content === 'tileset' }, children };
    for (const child of children) child.parent = node;
    return node;
}

// Obj2Tiles: a root without content, one tile per quarter at the coarsest level, finer tiles below
function obj2TilesTree() {
    const quarters = [0, 1, 2, 3].map(() => tile('model', [tile('model')]));
    return { root: tile(null, quarters), quarters, finer: quarters.map(q => q.children[0]) };
}

const isClay = scene => scene.children[0].material.isMeshMatcapMaterial === true;

describe('showsOwnColours', () => {
    it('is true for a texture or vertex colours on any mesh, false for plain meshes', () => {
        expect(showsOwnColours(tileScene('textured'))).toBe(true);
        expect(showsOwnColours(tileScene('vertexColours'))).toBe(true);
        expect(showsOwnColours(tileScene('plain'))).toBe(false);
        const mixed = tileScene('plain');
        mixed.add(tileScene('textured'));
        expect(showsOwnColours(mixed)).toBe(true);
    });
});

describe('topModelTiles', () => {
    it('is the root when it has a model, else the first tiles with a model under it', () => {
        const single = tile('model', [tile('model')]);
        expect(topModelTiles(single)).toEqual([single]);
        const { root, quarters } = obj2TilesTree();
        expect(topModelTiles(root)).toHaveLength(4);
        expect(new Set(topModelTiles(root))).toEqual(new Set(quarters));
    });

    it('is not known while an external tileset has not brought its tiles, nor without a root', () => {
        expect(topModelTiles(tile(null, [tile('model'), tile('tileset')]))).toBeNull();
        expect(topModelTiles(tile(null, [tile('tileset', [tile('model')])]))).toHaveLength(1);
        expect(topModelTiles(null)).toBeNull();
    });
});

describe('ModelShading: clay only for a model with no texture and no vertex colours in any tile', () => {
    it('keeps the materials of a textured model whose first tiles have no texture (a glass door): they never turn to clay', () => {
        const { root, quarters, finer } = obj2TilesTree();
        const shading = new ModelShading(() => root);
        // The quarter of the door and two others arrive first, without texture
        for (const quarter of quarters.slice(0, 3)) expect(shading.tileLoaded(quarter, tileScene())).toEqual([]);
        expect(shading.clay).toBe(false);
        // The last quarter has the texture
        expect(shading.tileLoaded(quarters[3], tileScene('textured'))).toEqual([]);
        // Finer tiles without texture keep their own material too
        expect(shading.tileLoaded(finer[0], tileScene())).toEqual([]);
        expect(shading.clay).toBe(false);
    });

    it('gives clay to a model without texture once all its top tiles arrived, to those that waited and to every later tile', () => {
        const { root, quarters, finer } = obj2TilesTree();
        const shading = new ModelShading(() => root);
        const scenes = quarters.map(() => tileScene());
        // A finer tile may arrive before the last quarter
        const early = tileScene();
        expect(shading.tileLoaded(finer[0], early)).toEqual([]);
        for (let i = 0; i < 3; i++) expect(shading.tileLoaded(quarters[i], scenes[i])).toEqual([]);
        const shaded = shading.tileLoaded(quarters[3], scenes[3]);
        expect(new Set(shaded.map(s => s.scene))).toEqual(new Set([...scenes, early]));
        // Each scene comes with its own tile (the clay it gets is freed with that tile)
        expect(new Set(shaded.map(s => s.tile))).toEqual(new Set([...quarters, finer[0]]));
        expect(shaded.find(s => s.scene === early).tile).toBe(finer[0]);
        expect(shading.clay).toBe(true);
        const later = tileScene();
        expect(shading.tileLoaded(finer[1], later)).toEqual([{ tile: finer[1], scene: later }]);
    });

    it('keeps a model with vertex colours as it is', () => {
        const { root, quarters } = obj2TilesTree();
        const shading = new ModelShading(() => root);
        expect(shading.tileLoaded(quarters[0], tileScene('vertexColours'))).toEqual([]);
        for (const quarter of quarters.slice(1)) expect(shading.tileLoaded(quarter, tileScene())).toEqual([]);
        expect(shading.clay).toBe(false);
    });

    it('waits again for a top tile unloaded before the verdict', () => {
        const { root, quarters } = obj2TilesTree();
        const shading = new ModelShading(() => root);
        for (const quarter of quarters.slice(0, 3)) shading.tileLoaded(quarter, tileScene());
        shading.tileDisposed(quarters[0]);
        expect(shading.tileLoaded(quarters[3], tileScene())).toEqual([]);
        const reloaded = tileScene();
        expect(shading.tileLoaded(quarters[0], reloaded).map(s => s.scene)).toContain(reloaded);
        expect(shading.clay).toBe(true);
    });
});

describe('UnifiedScene.shadeUntexturedTiles', () => {
    /** A tileset whose renderer dispatches the events of 3d-tiles-renderer. */
    function shadedTileset(root) {
        const tiles = new THREE.EventDispatcher();
        tiles.root = root;
        const tileset = { tiles };
        const scene = { libs, instance: { notifyChange: () => {} }, clayMatcap: null };
        UnifiedScene.prototype.shadeUntexturedTiles.call(scene, tileset);
        const load = (t, s) => tiles.dispatchEvent({ type: 'load-model', tile: t, scene: s });
        // Unloads a tile as the renderer does: its own disposeTile, which frees the lists of the tile
        const unload = t => TilesRenderer.prototype.disposeTile.call(Object.assign(tiles, { invokeOnePlugin: () => {} }), t);
        return { load, unload, scene };
    }

    /**
     * Gives a tile the engine data 3d-tiles-renderer gives it when it parses the tile, before
     * load-model: the scene and the geometries, materials and textures it holds at that time.
     */
    function parsed(t, scene) {
        const engineData = { scene, geometry: [], materials: [], textures: [], metadata: null };
        scene.traverse(c => {
            if (c.geometry) engineData.geometry.push(c.geometry);
            if (c.material) engineData.materials.push(c.material);
        });
        t.engineData = engineData;
        t.traversal = { visible: false, active: false };
        return scene;
    }

    it('leaves the untextured part of a textured model in its own material, whatever tile comes first', () => {
        const { root, quarters } = obj2TilesTree();
        const { load } = shadedTileset(root);
        const door = tileScene();
        load(quarters[0], door);
        load(quarters[1], tileScene('textured'));
        for (const quarter of quarters.slice(2)) load(quarter, tileScene());
        expect(isClay(door)).toBe(false);
        expect(door.children[0].material.isMeshStandardMaterial).toBe(true);
    });

    it('shades every tile of an untextured model in clay', () => {
        const { root, quarters, finer } = obj2TilesTree();
        const { load } = shadedTileset(root);
        const scenes = quarters.map(() => tileScene());
        quarters.forEach((quarter, i) => load(quarter, scenes[i]));
        const later = tileScene();
        load(finer[2], later);
        expect([...scenes, later].every(isClay)).toBe(true);
    });

    it('frees the clay material and the faceted geometry of a tile when the renderer unloads it, and keeps the shared matcap', () => {
        const { root, quarters } = obj2TilesTree();
        const { load, unload, scene } = shadedTileset(root);
        // A faceted part gets a new geometry (one normal per face) as well as the clay material
        const scenes = quarters.map(quarter => {
            const group = new THREE.Group();
            group.add(new THREE.Mesh(weldedCube(), new THREE.MeshStandardMaterial({ color: 0xffffff })));
            return parsed(quarter, group);
        });
        // The first three wait for the verdict, the last one decides it: all four are shaded at once
        quarters.forEach((quarter, i) => load(quarter, scenes[i]));
        const meshes = scenes.map(group => group.children[0]);
        expect(meshes.every(mesh => mesh.material.isMeshMatcapMaterial && !mesh.geometry.index)).toBe(true);
        const matcap = scene.clayMatcap;
        const matcapDisposed = vi.spyOn(matcap, 'dispose');
        const freed = meshes.map(mesh => ({ geometry: vi.spyOn(mesh.geometry, 'dispose'), material: vi.spyOn(mesh.material, 'dispose') }));

        quarters.forEach(unload);

        for (const { geometry, material } of freed) {
            expect(geometry).toHaveBeenCalled();
            expect(material).toHaveBeenCalled();
        }
        expect(matcapDisposed).not.toHaveBeenCalled();
    });

    it('gives the clay to a tile whose lists the renderer has not filled, and frees it with the tile', () => {
        const { root, quarters } = obj2TilesTree();
        const { load, unload } = shadedTileset(root);
        const scenes = quarters.map(quarter => parsed(quarter, tileScene()));
        quarters[0].engineData.materials = null;
        quarters.forEach((quarter, i) => load(quarter, scenes[i]));
        const clay = vi.spyOn(scenes[0].children[0].material, 'dispose');
        unload(quarters[0]);
        expect(clay).toHaveBeenCalled();
    });
});
