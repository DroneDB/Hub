import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createPointSize } from './pointSize';

/**
 * Stand-ins for Spark's dyno program builders that record how the modifier is put together: the
 * real ones build GLSL for the GPU, which is not here.
 */
function fakeDyno() {
    const calls = [];
    const dyno = {
        Gsplat: { type: 'Gsplat' },
        dynoFloat: vi.fn(value => ({ kind: 'float', value })),
        dynoBlock: vi.fn((inTypes, outTypes, build) => ({ inTypes, outTypes, build })),
        splitGsplat: vi.fn(gsplat => ({ outputs: { scales: { scalesOf: gsplat } } })),
        combineGsplat: vi.fn(parts => { calls.push(['combine', parts]); return { combined: parts }; }),
        mul: vi.fn((a, b) => ({ product: [a, b] }))
    };
    return { dyno, calls };
}

describe('createPointSize', () => {
    it('is a modifier that scales the scales of every splat by the factor, and nothing else', () => {
        const { dyno } = fakeDyno();
        const size = createPointSize(dyno, 1.5);
        const factor = dyno.dynoFloat.mock.results[0].value;
        expect(factor.value).toBe(1.5);

        const gsplat = { splat: true };
        const out = size.modifier.build({ gsplat });
        expect(dyno.splitGsplat).toHaveBeenCalledWith(gsplat);
        // The scales times the factor, put back into the same splat: centre, rotation and colour stay
        expect(dyno.mul).toHaveBeenCalledWith({ scalesOf: gsplat }, factor);
        const parts = dyno.combineGsplat.mock.calls[0][0];
        expect(parts.gsplat).toBe(gsplat);
        expect(Object.keys(parts).sort()).toEqual(['gsplat', 'scales']);
        expect(parts.scales).toEqual({ product: [{ scalesOf: gsplat }, factor] });
        expect(out.gsplat).toEqual({ combined: parts });
        expect(size.modifier.inTypes).toEqual({ gsplat: dyno.Gsplat });
        expect(size.modifier.outTypes).toEqual({ gsplat: dyno.Gsplat });
    });

    it('changes the factor of the program already built, and makes the mesh regenerate its splats', () => {
        const { dyno } = fakeDyno();
        const size = createPointSize(dyno);
        const mesh = { updateVersion: vi.fn() };
        expect(size.value).toBe(1);
        size.set(2.5, mesh);
        expect(size.value).toBe(2.5);
        expect(dyno.dynoFloat.mock.results[0].value.value).toBe(2.5);
        expect(mesh.updateVersion).toHaveBeenCalledTimes(1);
    });

    it('can be set before the mesh exists', () => {
        const { dyno } = fakeDyno();
        const size = createPointSize(dyno);
        expect(() => size.set(0.5)).not.toThrow();
        expect(() => size.set(0.7, null)).not.toThrow();
        expect(size.value).toBe(0.7);
    });
});

describe('createPointSize with Spark\'s own program builders', () => {
    let dyno;
    beforeAll(async () => {
        // Importing Spark starts loading its WebAssembly module, which a unit test has no use for
        vi.spyOn(WebAssembly, 'instantiateStreaming').mockReturnValue(new Promise(() => {}));
        vi.spyOn(WebAssembly, 'instantiate').mockReturnValue(new Promise(() => {}));
        dyno = (await import('@sparkjsdev/spark')).dyno;
    });

    /** The shader Spark generates for the modifier applied to a splat of constants, and its uniforms. */
    function program(size) {
        const index = dyno.dynoConst('int', 0);
        const splat = dyno.combineGsplat({
            index, flags: dyno.dynoConst('uint', 1), center: dyno.dynoConst('vec3', [1, 2, 3]), scales: dyno.dynoConst('vec3', [1, 1, 1]),
            quaternion: dyno.dynoConst('vec4', [0, 0, 0, 1]), rgba: dyno.dynoConst('vec4', [1, 1, 1, 1])
        });
        const graph = dyno.dynoBlock({ index: 'int' }, { gsplat: dyno.Gsplat }, () => ({ gsplat: size.modifier.apply({ gsplat: splat }).gsplat }));
        const template = new dyno.DynoProgramTemplate('{{ GLOBALS }}\nvoid main() {\n{{ STATEMENTS }}\n}\n');
        return new dyno.DynoProgram({ graph, inputs: { index: 'splatIndex' }, outputs: { gsplat: 'out' }, template });
    }

    it('multiplies only the scales by one uniform, which follows set()', () => {
        const size = createPointSize(dyno, 2);
        const prog = program(size);
        expect(prog.shader).toMatch(/product_\d+ = scales_\d+ \* value_\d+;/);
        expect(prog.shader).toContain('out.scales = product_');
        // Centre, rotation and colour pass through untouched
        expect(prog.shader).toMatch(/out\.center = gsplat_\d+\.center;/);
        expect(prog.shader).toMatch(/out\.quaternion = gsplat_\d+\.quaternion;/);
        expect(prog.shader).toMatch(/out\.rgba = gsplat_\d+\.rgba;/);
        const factor = () => Object.values(prog.uniforms)[0].value;
        expect(factor()).toBe(2);
        size.set(3);
        prog.update();
        expect(factor()).toBe(3);
    });
});
