import { describe, it, expect, vi } from 'vitest';
import { ref, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { h } from 'vue';
import { createFeatureScope } from './featureScope';

describe('createFeatureScope', () => {
    it('keeps state on the scope, reads/writes externals, exports refs and bound methods', async () => {
        const external = ref(1);
        const onChange = vi.fn();
        const api = createFeatureScope({
            data: () => ({ count: 0 }),
            computed: { double() { return this.count * 2; } },
            watch: { count(v) { onChange(v); } },
            methods: {
                bump() { this.count += this.step; this.shared += 1; }
            },
            externals: { step: () => 5, shared: external }
        });
        api.bump();
        expect(api.count.value).toBe(5);
        expect(api.double.value).toBe(10);
        expect(external.value).toBe(2);
        api.count.value = 7; // host writes through the ref
        await nextTick();
        expect(onChange).toHaveBeenLastCalledWith(7);
    });

    it('runs the teardown when the owning component unmounts', () => {
        const teardown = vi.fn();
        const wrapper = mount({ setup() { createFeatureScope({ beforeUnmount: teardown }); return () => h('div'); } });
        wrapper.unmount();
        expect(teardown).toHaveBeenCalledOnce();
    });
});
