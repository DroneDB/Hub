/**
 * FR-VWR-33, FR-VWR-37: the point cloud viewer draws at the applied ratio and its measure labels follow the size of the view;
 * the vendored potree.js (webapp/public/potree/build/potree/potree.js) sizes its targets from the drawing buffer and
 * draws point sizes in buffer pixels.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { attachPotreeScale, scaleMeasureLabels } from './potreeScale';
import { readSource } from '@/specs/cssSource';

afterEach(() => vi.unstubAllGlobals());

const label = (x = 10) => ({ scale: { value: x, multiplyScalar(f) { this.value *= f; return this; } } });
const measure = (extra = {}) => ({
    edgeLabels: [label()], angleLabels: [label()], coordinateLabels: [label()],
    heightLabel: label(), areaLabel: label(), circleRadiusLabel: label(), showHeight: false, ...extra
});
const scales = m => [...m.edgeLabels, ...m.angleLabels, ...m.coordinateLabels, m.heightLabel, m.areaLabel, m.circleRadiusLabel].map(l => l.scale.value);

describe('scaleMeasureLabels (FR-VWR-37)', () => {
    it('makes the labels the tool sized larger by the factor: edge, angle, coordinate, area and radius, and the height label of a height measure', () => {
        const plain = measure();
        const tall = measure({ showHeight: true });
        scaleMeasureLabels({ scene: { measurements: [plain, tall] } }, 1.5);
        expect(scales(plain)).toEqual([15, 15, 15, 10, 15, 15]);
        expect(scales(tall)).toEqual([15, 15, 15, 15, 15, 15]);
    });

    it('does nothing at a factor of 1, and with no measures', () => {
        const m = measure();
        scaleMeasureLabels({ scene: { measurements: [m] } }, 1);
        expect(scales(m)).toEqual([10, 10, 10, 10, 10, 10]);
        expect(() => scaleMeasureLabels({ scene: {} }, 2)).not.toThrow();
    });
});

describe('attachPotreeScale', () => {
    function setup(clientHeight) {
        const handlers = [];
        const viewer = {
            renderer: { setPixelRatio: vi.fn(), domElement: { clientHeight } },
            scene: { measurements: [measure()] }
        };
        const session = { track: vi.fn((target, type, fn) => handlers.push([target, type, fn])) };
        const potree = { TextSprite: { resolutionScale: 1 } };
        return { viewer, session, potree, handlers };
    }

    it('sets the pixel ratio of the renderer and of the label textures to min(devicePixelRatio, 2)', () => {
        vi.stubGlobal('devicePixelRatio', 3);
        const { viewer, session, potree } = setup(1080);
        attachPotreeScale(viewer, session, potree);
        expect(viewer.renderer.setPixelRatio).toHaveBeenCalledWith(2);
        expect(potree.TextSprite.resolutionScale).toBe(2);
    });

    it('applies the ratio again when the screen changes', () => {
        let onChange;
        vi.stubGlobal('matchMedia', () => ({ addEventListener: (type, fn) => { onChange = fn; }, removeEventListener() {} }));
        vi.stubGlobal('devicePixelRatio', 1);
        const { viewer, session, potree } = setup(1080);
        attachPotreeScale(viewer, session, potree);
        vi.stubGlobal('devicePixelRatio', 2);
        onChange();
        expect(viewer.renderer.setPixelRatio).toHaveBeenLastCalledWith(2);
        expect(potree.TextSprite.resolutionScale).toBe(2);
    });

    it('scales the labels in every update of the viewer, by the height of the canvas: 1.5 on 2104 px, 1 on 1080 px', () => {
        vi.stubGlobal('devicePixelRatio', 1);
        const large = setup(2104);
        attachPotreeScale(large.viewer, large.session, large.potree);
        expect(large.handlers).toHaveLength(1);
        const [target, type, hook] = large.handlers[0];
        expect(target).toBe(large.viewer);
        expect(type).toBe('update');
        hook();
        expect(scales(large.viewer.scene.measurements[0])).toEqual([15, 15, 15, 10, 15, 15]);

        const small = setup(1080);
        attachPotreeScale(small.viewer, small.session, small.potree);
        small.handlers[0][2]();
        expect(scales(small.viewer.scene.measurements[0])).toEqual([10, 10, 10, 10, 10, 10]);
    });

    it('stops following the screen when asked', () => {
        const removeEventListener = vi.fn();
        vi.stubGlobal('matchMedia', () => ({ addEventListener() {}, removeEventListener }));
        const { viewer, session, potree } = setup(1080);
        attachPotreeScale(viewer, session, potree)();
        expect(removeEventListener).toHaveBeenCalled();
    });
});

describe('the vendored potree.js draws at the drawing buffer size (FR-VWR-33)', () => {
    const source = readSource(__dirname, '../../../public/potree/build/potree/potree.js');
    const bodyOf = (start, end) => {
        const from = source.indexOf(start);
        expect(from).toBeGreaterThan(0);
        return source.slice(from, source.indexOf(end, from));
    };

    it('the EDL renderer sizes its targets from getDrawingBufferSize, not from the CSS size', () => {
        const render = bodyOf('class EDLRenderer{', 'class HQSplatRenderer{');
        expect(render).toContain('const {width, height} = this.viewer.renderer.getDrawingBufferSize(new Vector2());');
        expect(render).not.toContain('const {width, height} = this.viewer.renderer.getSize(');
    });

    it('the HQ splat renderer does too, and keeps the navigation cube viewport in CSS px', () => {
        const render = bodyOf('class HQSplatRenderer{', 'class View{');
        expect(render).toContain('const {width, height} = this.viewer.renderer.getDrawingBufferSize(new Vector2());');
        expect(render).toContain('viewer.renderer.setViewport(cssSize.width - viewer.navigationCube.width,');
        expect(render).toContain('viewer.renderer.setViewport(0, 0, cssSize.width, cssSize.height);');
    });

    it('the materials get the size of the buffer the points are drawn in', () => {
        expect(source.split('material.screenWidth = renderer.domElement.width;').length - 1).toBe(2);
        expect(source).not.toContain('material.screenWidth = renderer.domElement.clientWidth;');
    });

    // The method itself, run on stand-ins: the pixels of the target over the CSS pixels of the canvas
    const pointSizeScale = (() => {
        const text = bodyOf('pointSizeScale(target){', 'renderOctree(octree');
        const Vector2 = class { set(w, h) { this.width = w; this.height = h; return this; } };
        const method = new Function('Vector2', `return function ${text.replace(/\}\s*$/, '}')}`)(Vector2);
        return (cssWidth, bufferWidth, target) => method.call({
            threeRenderer: { getSize: v => v.set(cssWidth, 100), domElement: { width: bufferWidth } }
        }, target);
    })();

    it('is 2 for the canvas of a ratio-2 screen and 1 for the pick target of the CSS size', () => {
        expect(pointSizeScale(1920, 3840, null)).toBe(2);
        expect(pointSizeScale(1920, 2880, null)).toBe(1.5);
        expect(pointSizeScale(1920, 1920, null)).toBe(1);
        expect(pointSizeScale(1920, 3840, { width: 3840 })).toBe(2);
        expect(pointSizeScale(1920, 3840, { width: 1921 })).toBe(1);
        expect(pointSizeScale(0, 0, null)).toBe(1);
    });

    it('draws the text of its labels at TextSprite.resolutionScale times their size', () => {
        const sprite = bodyOf('class TextSprite extends Object3D{', 'class Volume extends Object3D');
        expect(sprite).toContain('const resolutionScale = TextSprite.resolutionScale || 1;');
        expect(sprite).toContain('context.canvas.width = Math.ceil(spriteWidth * resolutionScale);');
        expect(sprite).toContain('context.scale(resolutionScale, resolutionScale);');
        // The sprite keeps its size in the scene
        expect(sprite).toContain('this.sprite.scale.set(spriteWidth * 0.01, spriteHeight * 0.01, 1.0);');
    });
});

describe('Renderer.renderOctree of the vendored potree.js uploads the point sizes in the pixels of the target (FR-XC-32, FR-VWR-33)', () => {
    // The whole bundle, run with stand-ins for the globals it reads (its own Potree global, proj4, jQuery and its plugins)
    const chain = new Proxy(function () {}, {
        get: (t, key) => (key === Symbol.toPrimitive ? () => '' : chain), apply: () => chain, construct: () => chain
    });
    const Potree = {};
    vi.spyOn(console, 'log').mockImplementation(() => {});
    new Function('exports', 'module', 'Potree', 'proj4', '$', 'jQuery', readSource(__dirname, '../../../public/potree/build/potree/potree.js'))(
        Potree, {}, Potree, Object.assign(() => ({}), { defs() {} }), chain, Object.assign(() => ({}), { fn: { extend() {} } })
    );
    vi.mocked(console.log).mockRestore();
    // A Potree scene makes the perspective and the orthographic camera of the viewer (three.js as bundled in potree.js)
    const { cameraP, cameraO } = new Potree.Scene();

    /**
     * The uniforms renderOctree uploads for a material with points of 4 CSS px (2 to 50 px), drawn into a target of
     * 3840 x 2160 (the EDL target of a ratio-2 screen) with a canvas of 1920 x 1080 CSS px.
     */
    function upload(pointSizeType, camera = cameraP) {
        const gl = new Proxy({}, { get: () => () => {} });
        const renderer = new Potree.Renderer({
            getContext: () => gl,
            getSize: v => v.set(1920, 1080),
            domElement: { width: 3840, height: 2160 },
            properties: { get: () => ({}) }
        });
        renderer.renderNodes = () => {};
        const uniforms = {};
        const shader = {
            program: {}, uniformLocations: {}, vs: '',
            update(vs) { this.vs = vs; },
            setUniform1f: (name, value) => { uniforms[name] = value; },
            setUniform() {}, setUniform1i() {}, setUniform2f() {}, setUniform3f() {}, setUniformMatrix4() {}
        };
        // The material draws its gradient textures on a canvas (happy-dom has no 2D context)
        const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(chain);
        const material = new Potree.PointCloudMaterial();
        getContext.mockRestore();
        material.pointSizeType = pointSizeType;
        material.size = 4;
        material.minSize = 2;
        material.maxSize = 50;
        renderer.shaders.set(material, shader);
        const octree = {
            material,
            pcoGeometry: { root: { isLoaded: () => false } },
            computeVisibilityTextureData: () => ({ data: new Uint8Array(0) })
        };
        renderer.renderOctree(octree, [], camera, { width: 3840, height: 2160 });
        return { size: uniforms.size, minSize: uniforms.minSize, maxSize: uniforms.maxSize, uScreenHeight: uniforms.uScreenHeight, vs: shader.vs };
    }

    it('a fixed size is pixels in the shader: 4 CSS px are 8 px of the target', () => {
        const { size, minSize, maxSize, vs } = upload(Potree.PointSizeType.FIXED);
        expect(vs).toContain('#define fixed_point_size');
        expect({ size, minSize, maxSize }).toEqual({ size: 8, minSize: 4, maxSize: 100 });
    });

    it('an adaptive size is multiplied by the height of the target in the shader: the size is not scaled, the limits are', () => {
        const { size, minSize, maxSize, uScreenHeight, vs } = upload(Potree.PointSizeType.ADAPTIVE);
        expect(vs).toContain('#define adaptive_point_size');
        expect(uScreenHeight).toBe(2160);
        expect({ size, minSize, maxSize }).toEqual({ size: 4, minSize: 4, maxSize: 100 });
    });

    it('an attenuated size is too, with a perspective camera', () => {
        const { size, minSize, maxSize, uScreenHeight, vs } = upload(Potree.PointSizeType.ATTENUATED);
        expect(vs).toContain('#define attenuated_point_size');
        expect(uScreenHeight).toBe(2160);
        expect({ size, minSize, maxSize }).toEqual({ size: 4, minSize: 4, maxSize: 100 });
    });

    it('with an orthographic camera, an attenuated size is pixels and an adaptive one is not', () => {
        expect(upload(Potree.PointSizeType.ATTENUATED, cameraO)).toMatchObject({ size: 8, minSize: 4, maxSize: 100 });
        expect(upload(Potree.PointSizeType.ADAPTIVE, cameraO)).toMatchObject({ size: 4, minSize: 4, maxSize: 100 });
    });
});
