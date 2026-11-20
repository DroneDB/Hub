import { describe, it, expect, vi } from 'vitest';
import { createResolver } from './resolver';

describe('createResolver', () => {
    const rules = {
        name: v => (v ? null : 'Enter a name.'),
        again: (v, values) => (v === values.name ? null : 'Must match the name.')
    };

    it('returns the values and no errors when every validator is satisfied', () => {
        const resolve = createResolver(rules);
        expect(resolve({ values: { name: 'a', again: 'a' } })).toEqual({ values: { name: 'a', again: 'a' }, errors: {} });
    });

    it('gives each problem as the [{ message }] list the library reads, by field name', () => {
        const resolve = createResolver(rules);
        const result = resolve({ values: { name: '', again: 'x' } });
        expect(result.errors).toEqual({
            name: [{ message: 'Enter a name.' }],
            again: [{ message: 'Must match the name.' }]
        });
    });

    it('gives each validator the value of its field and all the values', () => {
        const spy = vi.fn(() => null);
        createResolver({ b: spy })({ values: { a: 1, b: 2 } });
        expect(spy).toHaveBeenCalledWith(2, { a: 1, b: 2 });
    });

    it('checks only the registered fields when the library names them', () => {
        const resolve = createResolver(rules);
        const result = resolve({ values: { name: '', again: 'x' }, names: ['name'] });
        expect(Object.keys(result.errors)).toEqual(['name']);
    });

    it('treats a missing value as undefined, not as a crash', () => {
        const resolve = createResolver(rules);
        expect(resolve({ values: {} }).errors.name).toEqual([{ message: 'Enter a name.' }]);
    });

    it('reads the validators again at each call when they are given as a function', () => {
        let needed = false;
        const resolve = createResolver(() => (needed ? { name: () => 'now it is wrong' } : {}));
        expect(resolve({ values: { name: 'x' } }).errors).toEqual({});
        needed = true;
        expect(resolve({ values: { name: 'x' } }).errors).toEqual({ name: [{ message: 'now it is wrong' }] });
    });
});
