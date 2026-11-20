/**
 * The text editor guards against a file that is not text: when the loaded content has a NUL
 * character or a ZIP header it opens read-only, with a warning, and offers no Save or Format.
 */
import { describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import TextEditorDialog from './TextEditorDialog.vue';

const WARNING = 'This file is not text: it opens read-only.';

// CodeMirror needs a real DOM: the editor itself is left out, the dialog around it is tested
const Editor = { ...TextEditorDialog, methods: { ...TextEditorDialog.methods, initEditor() {} } };

async function mountEditor(content, path = 'shapes.geojson') {
    const dataset = { getFileContents: vi.fn().mockResolvedValue(content), writeObj: vi.fn(), downloadUrl: vi.fn() };
    const w = mount(Editor, {
        props: { dataset, entry: { path, size: content.length } },
        global: { plugins: [PrimeVue], stubs: { Window: { props: ['title'], template: '<div><h1>{{ title }}</h1><slot /></div>' } } },
        attachTo: document.body
    });
    await flushPromises();
    await w.vm.$nextTick();
    return { w, dataset };
}

describe('TextEditorDialog', () => {
    it('opens binary content read-only, with a warning', async () => {
        const { w, dataset } = await mountEditor('PK\u0003\u0004\u0014\u0000binary', 'places.kml');
        expect(w.text()).toContain(WARNING);
        expect(w.find('h1').text()).toBe('View: places.kml');
        expect(w.vm.isReadonly).toBe(true);
        expect(w.findAll('button').map(b => b.text())).not.toContain('Format');
        w.vm.save();
        expect(dataset.writeObj).not.toHaveBeenCalled();
        w.unmount();
    });

    it('opens text content for editing, without the warning', async () => {
        const { w } = await mountEditor('{"type":"FeatureCollection","features":[]}');
        expect(w.text()).not.toContain(WARNING);
        expect(w.find('h1').text()).toBe('Edit: shapes.geojson');
        expect(w.vm.isReadonly).toBe(false);
        expect(w.findAll('button').map(b => b.text())).toContain('Format');
        w.unmount();
    });
});
