/**
 * The options search of the Run Photogrammetry window (FR-PRC-25, FR-PRC-38): the one SearchField (its Escape clears
 * the query and the event is handled, so the dialog around it stays open with every field it holds; with nothing to
 * clear Escape closes the search only), the matching options shown with their groups expanded, and a message when
 * no option matches.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import { defineComponent, h, ref } from 'vue';
import Window from '@/components/HubWindow.vue';
import SearchField from '@/components/SearchField.vue';
import OdxOptionsEditor from './OdxOptionsEditor.vue';
import OdxOptionRow from './OdxOptionRow.vue';

const AVAILABLE = [
    { name: 'dem-resolution', type: 'float', value: '5', domain: 'cm/pixel', help: '' },
    { name: 'orthophoto-resolution', type: 'float', value: '5', domain: 'cm/pixel', help: '' },
    { name: 'dsm', type: 'bool', value: false, help: '' },
    { name: 'pc-quality', type: 'enum', value: 'medium', domain: ['low', 'medium', 'high'], help: '' }
];

let wrapper;
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
});

/** The editor in a Window, as TaskHistory shows it; `closed` counts the times the window asked to close */
async function mountInWindow() {
    const state = { closed: 0 };
    const Host = defineComponent({
        setup() {
            const custom = ref([]);
            return () => h(Window, { visible: true, modal: true, title: 'Run Photogrammetry', fixedPosition: true, onClose: () => { state.closed++; } }, {
                default: () => [
                    h('input', { id: 'folder', value: 'flight-1' }),
                    h(OdxOptionsEditor, { availableOptions: AVAILABLE, presetOptions: [], modelValue: custom.value, 'onUpdate:modelValue': v => { custom.value = v; } })
                ]
            });
        }
    });
    wrapper = mount(Host, { attachTo: document.body, global: { plugins: [PrimeVue] } });
    await flushPromises();
    return state;
}
const editor = () => wrapper.findComponent(OdxOptionsEditor);
const clickButton = text => [...document.querySelectorAll('.odm-options-editor button')].find(b => b.textContent.trim().startsWith(text)).click();
const searchInput = () => document.querySelector('.odm-search-bar input');
async function type(text) {
    const input = searchInput();
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flushPromises();
}
const escape = () => {
    const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    searchInput().dispatchEvent(e);
    return e;
};
const rowNames = () => editor().findAllComponents(OdxOptionRow).map(r => r.props('option').name);

describe('Esc in the options search (FR-PRC-25)', () => {
    it('uses the SearchField, with its clear button, and focuses it when the search opens', async () => {
        await mountInWindow();
        clickButton('Search');
        await flushPromises();
        expect(editor().findComponent(SearchField).exists()).toBe(true);
        expect(document.activeElement).toBe(searchInput());
        await type('resolution');
        expect(document.querySelector('.odm-search-bar [aria-label="Clear search"]')).not.toBeNull();
    });

    it('clears the query, handles the event and keeps the window open with its fields', async () => {
        const state = await mountInWindow();
        clickButton('Search');
        await flushPromises();
        await type('resolution');

        const e = escape();
        await flushPromises();

        expect(e.defaultPrevented).toBe(true);
        expect(searchInput().value).toBe('');
        expect(editor().vm.searchQuery).toBe('');
        expect(editor().vm.showSearch).toBe(true);
        expect(state.closed).toBe(0);
        expect(document.querySelector('#folder').value).toBe('flight-1');
        // the focus stays in the field
        expect(document.activeElement).toBe(searchInput());
    });

    it('with an empty field Escape closes the search only, and the window stays open', async () => {
        const state = await mountInWindow();
        clickButton('Search');
        await flushPromises();

        const e = escape();
        await flushPromises();

        expect(e.defaultPrevented).toBe(true);
        expect(editor().vm.showSearch).toBe(false);
        expect(document.querySelector('.odm-search-bar')).toBeNull();
        expect(state.closed).toBe(0);
        expect(document.querySelector('#folder')).not.toBeNull();
    });

    it('does not own Escape once the search is closed: the window closes as usual', async () => {
        const state = await mountInWindow();
        document.querySelector('#folder').focus();
        document.querySelector('#folder').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        await flushPromises();
        expect(state.closed).toBe(1);
    });
});

describe('the options search results (FR-PRC-38)', () => {
    it('shows the matching options with their groups expanded', async () => {
        await mountInWindow();
        // every group starts collapsed: its rows are hidden
        const hidden = () => [...document.querySelectorAll('.odm-option-group-content')].filter(c => c.style.display === 'none').length;
        expect(hidden()).toBeGreaterThan(0);

        clickButton('Search');
        await flushPromises();
        await type('resolution');

        expect(rowNames().sort()).toEqual(['dem-resolution', 'orthophoto-resolution']);
        expect(hidden()).toBe(0);
        for (const header of document.querySelectorAll('.odm-option-group-header')) {
            expect(header.getAttribute('aria-expanded')).toBe('true');
        }
    });

    it('puts the groups back as they were when the search ends', async () => {
        await mountInWindow();
        clickButton('Search');
        await flushPromises();
        await type('resolution');
        await type('');
        const headers = [...document.querySelectorAll('.odm-option-group-header')];
        expect(headers.length).toBeGreaterThan(0);
        for (const header of headers) expect(header.getAttribute('aria-expanded')).toBe('false');
    });

    it('says "No options match" with the query, and Clear search empties it and refocuses the field', async () => {
        await mountInWindow();
        clickButton('Search');
        await flushPromises();
        await type('zzzz');

        expect(rowNames()).toEqual([]);
        expect(document.querySelector('.odm-no-match h3').textContent).toBe('No options match "zzzz"');
        const clear = [...document.querySelectorAll('.odm-no-match button')].find(b => b.textContent.trim() === 'Clear search');
        clear.click();
        await flushPromises();
        expect(editor().vm.searchQuery).toBe('');
        expect(document.querySelector('.odm-no-match')).toBeNull();
        expect(document.activeElement).toBe(searchInput());
    });

    it('filters the flat view too', async () => {
        await mountInWindow();
        clickButton('Flat View');
        await flushPromises();
        expect(rowNames()).toHaveLength(4);
        clickButton('Search');
        await flushPromises();
        await type('dsm');
        expect(rowNames()).toEqual(['dsm']);
    });
});
