/**
 * PropsTable: EPSG codes in values get an info button to epsg.io, the copy buttons copy the value
 * given for their row and the Type row explains the entry type.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

vi.mock('@/composables/useCopyText', () => ({ copyText: vi.fn(() => Promise.resolve()) }));
import { copyText } from '@/composables/useCopyText';
import PropsTable from './PropsTable.vue';

const notify = { success: vi.fn() };
const mountTable = (props) => mount(PropsTable, {
    props: { preserveOrder: true, ...props },
    global: { plugins: [PrimeVue], mocks: { $notify: notify }, stubs: { Window: true, EntryTypeInfoDialog: true } }
});

describe('PropsTable', () => {
    beforeEach(() => { copyText.mockClear(); notify.success.mockClear(); });

    it('keeps the EPSG code as text, with an info button that opens epsg.io in a new tab', () => {
        const wrapper = mountTable({ obj: { coordinates: 'EPSG:4326 11.2, 46.1, 300.00m' } });
        const link = wrapper.find('a[href="https://epsg.io/4326"]');
        expect(link.exists()).toBe(true);
        expect(link.text()).toBe('');
        expect(link.find('.fa-circle-question').exists()).toBe(true);
        expect(link.attributes('aria-label')).toBe('What is EPSG:4326? (opens epsg.io)');
        expect(link.attributes('target')).toBe('_blank');
        expect(link.attributes('rel')).toContain('noopener');
        expect(wrapper.text()).toContain('EPSG:4326 11.2, 46.1, 300.00m');
    });

    it('links codes in nested values too', () => {
        const wrapper = mountTable({ obj: { vector: { crs: 'EPSG:32633 (from the .prj file)' } } });
        expect(wrapper.find('a[href="https://epsg.io/32633"]').exists()).toBe(true);
    });

    it('copies the value given for the row and names it', async () => {
        const wrapper = mountTable({
            obj: { coordinates: 'EPSG:4326 11.2, 46.1', size: '10 B' },
            copyableValues: {
                coordinates: { text: '11.2, 46.1', label: 'coordinates' },
                size: { text: 'abc123', label: 'hash' }
            }
        });
        const button = wrapper.find('button[aria-label="Copy coordinates to clipboard"]');
        expect(button.exists()).toBe(true);
        expect(wrapper.find('button[aria-label="Copy hash to clipboard"]').exists()).toBe(true);
        await button.trigger('click');
        await flushPromises();
        expect(copyText).toHaveBeenCalledWith('11.2, 46.1');
        expect(notify.success).toHaveBeenCalledWith('Coordinates copied to clipboard', { summary: 'Copied' });
    });

    it('has no copy button on rows without a copy value, nor on nested rows with the same key', () => {
        const wrapper = mountTable({
            obj: { path: 'a.jpg', meta: { coordinates: 'x' } },
            copyableValues: { coordinates: { text: '1, 2', label: 'coordinates' } }
        });
        expect(wrapper.find('button[aria-label^="Copy"]').exists()).toBe(false);
    });

    it('shows the type name as text and opens its description only from the ? button', async () => {
        const wrapper = mountTable({ obj: { type: 'GeoRaster', meta: { type: 'Feature' } }, entryType: 4 });
        const buttons = wrapper.findAll('button.type-info-btn');
        expect(buttons).toHaveLength(1);
        expect(buttons[0].attributes('aria-label')).toBe('What is GeoRaster?');
        const name = buttons[0].element.parentElement.querySelector('span');
        expect(name.textContent).toBe('GeoRaster');
        expect(name.closest('button')).toBeNull();
        expect(wrapper.findComponent({ name: 'EntryTypeInfoDialog' }).exists()).toBe(false);
        await buttons[0].trigger('click');
        expect(wrapper.findComponent({ name: 'EntryTypeInfoDialog' }).props('type')).toBe(4);
    });

    it('keeps the Type row plain without an entry type, or for a type without a description', () => {
        expect(mountTable({ obj: { type: 'GeoRaster' } }).find('button.type-info-btn').exists()).toBe(false);
        expect(mountTable({ obj: { type: 'Unknown' }, entryType: 0 }).find('button.type-info-btn').exists()).toBe(false);
    });

    it('reads an entry type given as a string', () => {
        expect(mountTable({ obj: { type: 'Vector' }, entryType: '14' }).find('button.type-info-btn').exists()).toBe(true);
    });
});
