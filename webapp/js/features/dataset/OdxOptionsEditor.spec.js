/**
 * The NodeODX options editor and its option rows (FR-PRC-07): selecting a processing profile replaces the options of
 * the profile, and only what the user changed by hand stays. The old rows emitted every value they were given, so
 * the options of the profiles selected before were stored as customizations and 'Default' could run as 'Fast
 * Orthophoto'.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { defineComponent, h, ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import OdxOptionsEditor from './OdxOptionsEditor.vue';
import OdxOptionRow from './OdxOptionRow.vue';
import TaskHistory from './TaskHistory.vue';

const AVAILABLE = [
    { name: 'auto-boundary', type: 'bool', value: false, help: '' },
    { name: 'dsm', type: 'bool', value: false, help: '' },
    { name: 'fast-orthophoto', type: 'bool', value: false, help: '' },
    { name: 'dem-resolution', type: 'float', value: '5', domain: 'cm/pixel', help: '' },
    { name: 'pc-quality', type: 'enum', value: 'medium', domain: ['low', 'medium', 'high'], help: '' }
];
const DEFAULT = [{ name: 'auto-boundary', value: true }, { name: 'dsm', value: true }];
const FAST = [{ name: 'auto-boundary', value: true }, { name: 'fast-orthophoto', value: true }];

let wrapper;
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
});

// The editor as TaskHistory uses it: v-model is the customizations, the profile options are a prop
function mountEditor() {
    const preset = ref(DEFAULT);
    const custom = ref([]);
    const Host = defineComponent({
        setup: () => () => h(OdxOptionsEditor, {
            availableOptions: AVAILABLE,
            presetOptions: preset.value,
            modelValue: custom.value,
            'onUpdate:modelValue': v => { custom.value = v; }
        })
    });
    wrapper = mount(Host, { attachTo: document.body, global: { plugins: [PrimeVue] } });
    return { preset, custom };
}

const rowOf = name => wrapper.findAllComponents(OdxOptionRow).find(r => r.props('option').name === name);

describe('OdxOptionsEditor - the processing profile', () => {
    it('Default, then Fast Orthophoto, then Default again leaves no customization', async () => {
        const { preset, custom } = mountEditor();
        await flushPromises();

        preset.value = FAST;
        await flushPromises();
        expect(custom.value).toEqual([]);

        preset.value = DEFAULT;
        await flushPromises();
        expect(custom.value).toEqual([]);
        // ... and the rows show the Default profile
        expect(rowOf('dsm').props('option').value).toBe(true);
        expect(rowOf('fast-orthophoto').props('option').value).toBe(false);
    });

    it('keeps what the user changed by hand when the profile changes', async () => {
        const { preset, custom } = mountEditor();
        await flushPromises();
        rowOf('dem-resolution').vm.$emit('update:value', '2');
        await flushPromises();
        expect(custom.value).toEqual([{ name: 'dem-resolution', value: '2' }]);

        preset.value = FAST;
        await flushPromises();
        preset.value = DEFAULT;
        await flushPromises();

        expect(custom.value).toEqual([{ name: 'dem-resolution', value: '2' }]);
    });

    it('stores a customization only when it differs from the profile value', async () => {
        const { custom } = mountEditor();
        await flushPromises();

        // dsm is true in the Default profile: unchecking it is a customization, checking it again is not
        rowOf('dsm').vm.$emit('update:value', false);
        await flushPromises();
        expect(custom.value).toEqual([{ name: 'dsm', value: false }]);

        rowOf('dsm').vm.$emit('update:value', true);
        await flushPromises();
        expect(custom.value).toEqual([]);

        // the value of the node's default, for an option the profile does not set
        rowOf('pc-quality').vm.$emit('update:value', 'medium');
        await flushPromises();
        expect(custom.value).toEqual([]);
        rowOf('pc-quality').vm.$emit('update:value', 'high');
        await flushPromises();
        expect(custom.value).toEqual([{ name: 'pc-quality', value: 'high' }]);
    });

    it('drops a hand change that the new profile sets to the same value', async () => {
        const { preset, custom } = mountEditor();
        await flushPromises();
        rowOf('fast-orthophoto').vm.$emit('update:value', true);
        await flushPromises();
        expect(custom.value).toEqual([{ name: 'fast-orthophoto', value: true }]);

        preset.value = FAST;
        await flushPromises();

        expect(custom.value).toEqual([]);
    });
});

describe('OdxOptionRow', () => {
    function mountRow(option) {
        return mount(OdxOptionRow, { props: { option }, global: { plugins: [PrimeVue], directives: { tooltip: {} } } });
    }

    it('emits nothing when the profile changes its value', async () => {
        const row = mountRow({ name: 'dsm', type: 'bool', value: false, defaultValue: false });
        await row.setProps({ option: { name: 'dsm', type: 'bool', value: true, defaultValue: false } });
        await flushPromises();

        expect(row.emitted('update:value')).toBeUndefined();
        expect(row.findComponent({ name: 'Checkbox' }).props('modelValue')).toBe(true);
    });

    it('emits the value the user enters, and an empty one on Reset', async () => {
        const row = mountRow({ name: 'dem-resolution', type: 'float', value: '5', defaultValue: '5' });
        row.findComponent({ name: 'InputText' }).vm.$emit('update:modelValue', '2');
        await flushPromises();
        expect(row.emitted('update:value')).toEqual([['2']]);

        await row.find('.odm-reset-btn').trigger('click');
        expect(row.emitted('update:value')).toEqual([['2'], ['']]);
    });
});

describe('TaskHistory - the submit of the profile', () => {
    // The pieces of the component that build the params
    function vmFor(preset, customOptions) {
        const vm = {
            photogrammetryForm: { preset, createNewDataset: false, destPath: 'results', folder: '', nodeId: '', name: '' },
            customOptions,
            optionsError: '',
            destPathError: ''
        };
        vm.selectedPreset = TaskHistory.computed.selectedPreset.call(vm);
        return vm;
    }

    it('sends the options of the Default profile after Default, Fast, Default', async () => {
        const { preset, custom } = mountEditor();
        await flushPromises();
        preset.value = FAST;
        await flushPromises();
        preset.value = DEFAULT;
        await flushPromises();

        const params = TaskHistory.methods._buildSubmitParams.call(vmFor('default', custom.value));

        expect(params.options).toEqual([{ name: 'auto-boundary', value: true }, { name: 'dsm', value: true }]);
    });
});
