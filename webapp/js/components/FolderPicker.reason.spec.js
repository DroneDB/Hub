/**
 * The disabled rows of the picker say why (FR-MAP-22, FR-XC-22): a row that cannot be selected stays focusable and its
 * name carries the reason as its description and tooltip.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import ddb from 'ddb';
import FolderPicker from './FolderPicker.vue';
import DisabledReason from './DisabledReason.vue';

const { entry } = ddb;

const ENTRIES = [
    { path: 'flights', type: entry.type.DIRECTORY },
    { path: 'a.tif', type: entry.type.GEORASTER },
    { path: 'b.tif', type: entry.type.GEORASTER },
    { path: 'notes.txt', type: entry.type.GENERIC }
];

const Stub = { template: '<div><slot /><slot name="footer" /></div>' };
let wrapper;

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
});

async function picker(props = {}) {
    const dataset = { list: vi.fn().mockResolvedValue(ENTRIES), createFolder: vi.fn() };
    wrapper = mount(FolderPicker, {
        props: { dataset, mode: 'file', ...props },
        attachTo: document.body,
        global: { plugins: [PrimeVue], stubs: { Window: Stub, HubWindow: Stub, PathBreadcrumb: true, ConfirmDialog: true } }
    });
    await flushPromises();
    return wrapper;
}

const rowOf = (w, name) => w.findAll('tbody tr').find(tr => tr.text().includes(name));
const reasonOf = tr => {
    const target = tr.find('.disabled-reason');
    return target.exists() ? document.getElementById(target.attributes('aria-describedby')).textContent : null;
};

describe('FolderPicker disabled rows', () => {
    it('says "Already on the map" for an excluded path and "Not a map layer" for a file that accept rejects', async () => {
        const w = await picker({
            accept: e => e.type === entry.type.GEORASTER, exclude: ['a.tif'],
            excludeReason: 'Already on the map', rejectReason: 'Not a map layer'
        });
        expect(reasonOf(rowOf(w, 'a.tif'))).toBe('Already on the map');
        expect(reasonOf(rowOf(w, 'notes.txt'))).toBe('Not a map layer');
        // A row that can be selected has no reason, and no focus stop of its own
        expect(rowOf(w, 'b.tif').find('.disabled-reason').exists()).toBe(false);
        expect(reasonOf(rowOf(w, 'b.tif'))).toBeNull();
    });

    it('keeps the disabled name focusable (aria-disabled) with the reason as its tooltip', async () => {
        const w = await picker({ exclude: ['a.tif'], excludeReason: 'Already on the map' });
        const target = rowOf(w, 'a.tif').find('.disabled-reason');
        expect(target.attributes('tabindex')).toBe('0');
        expect(target.attributes('aria-disabled')).toBe('true');
        expect(target.attributes('title')).toBe('Already on the map');
        // A role, so that aria-disabled is announced: a click on a row chooses it, the name is a button that is disabled
        expect(target.attributes('role')).toBe('button');
        target.element.focus();
        expect(document.activeElement).toBe(target.element);
    });

    it('says why a folder or a file is not for this mode', async () => {
        const w = await picker();
        expect(reasonOf(rowOf(w, 'flights'))).toBe('Open the folder to choose a file inside it');
        const folders = await picker({ mode: 'folder' });
        expect(reasonOf(rowOf(folders, 'notes.txt'))).toBe('Only folders can be chosen here');
        expect(reasonOf(rowOf(folders, 'flights'))).toBeNull();
    });
});

describe('DisabledReason', () => {
    it('gives the focusable item a role (a button by default, the one its context passes otherwise)', () => {
        const byDefault = mount(DisabledReason, { props: { reason: 'No changes to save' }, slots: { default: 'Save' } });
        expect(byDefault.find('.disabled-reason').attributes('role')).toBe('button');

        const option = mount(DisabledReason, { props: { reason: 'Already on the map', role: 'option' }, slots: { default: 'a.tif' } });
        expect(option.find('.disabled-reason').attributes('role')).toBe('option');
        expect(option.find('.disabled-reason').attributes('aria-disabled')).toBe('true');
    });

    it('is the content alone without a reason', () => {
        const w = mount(DisabledReason, { slots: { default: '<b>name</b>' } });
        expect(w.html()).toContain('<b>name</b>');
        expect(w.find('.disabled-reason').exists()).toBe(false);
    });
});
