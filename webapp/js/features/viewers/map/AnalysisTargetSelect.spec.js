import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import AnalysisTargetSelect from './AnalysisTargetSelect.vue';

const CANDIDATES = [{ path: 'odm_dem/dtm.tif', label: 'dtm.tif' }, { path: 'odm_dem/dsm.tif', label: 'dsm.tif' }];
let wrapper;
const render = props => {
    wrapper = mount(AnalysisTargetSelect, { attachTo: document.body, props: { candidates: CANDIDATES, modelValue: 'odm_dem/dsm.tif', ...props } });
    return wrapper;
};
afterEach(() => wrapper?.unmount());

describe('AnalysisTargetSelect', () => {
    it('is hidden with fewer than two candidates, there is nothing to choose', () => {
        expect(render({ candidates: [] }).find('select').exists()).toBe(false);
        wrapper.unmount();
        expect(render({ candidates: [CANDIDATES[0]] }).find('select').exists()).toBe(false);
    });

    it('lists the candidates by label under a visible "Elevation model" label, and shows the current one', () => {
        render();
        const select = wrapper.find('select');
        expect(select.classes()).toContain('panel-select');
        const label = wrapper.find('label');
        expect(label.text()).toBe('Elevation model');
        expect(label.attributes('for')).toBe(select.attributes('id'));
        expect(select.findAll('option').map(o => o.text())).toEqual(['dtm.tif', 'dsm.tif']);
        expect(select.element.value).toBe('odm_dem/dsm.tif');
    });

    it('asks for the path that was picked', async () => {
        render();
        await wrapper.find('select').setValue('odm_dem/dtm.tif');
        expect(wrapper.emitted('update:modelValue')).toEqual([['odm_dem/dtm.tif']]);
    });

    it('goes back to the current value when the parent keeps it (Cancel on the question)', async () => {
        render();
        const select = wrapper.find('select');
        await select.setValue('odm_dem/dtm.tif');
        await nextTick();
        expect(wrapper.props('modelValue')).toBe('odm_dem/dsm.tif');
        expect(select.element.value).toBe('odm_dem/dsm.tif');
    });

    it('follows the parent when it takes the new value', async () => {
        render();
        const select = wrapper.find('select');
        await select.setValue('odm_dem/dtm.tif');
        await wrapper.setProps({ modelValue: 'odm_dem/dtm.tif' });
        expect(select.element.value).toBe('odm_dem/dtm.tif');
    });

    it('follows a change of target that the user did not make', async () => {
        render();
        await wrapper.setProps({ modelValue: 'odm_dem/dtm.tif' });
        expect(wrapper.find('select').element.value).toBe('odm_dem/dtm.tif');
    });
});
