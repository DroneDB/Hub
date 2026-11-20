/**
 * Every entry type the Hub names has a full description, and the dialog shows it.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import ddb from 'ddb';
import { getEntryTypeInfo } from './entryTypeInfo';
import { getTypeDisplayName } from './entryTypes';
import EntryTypeInfoDialog from '@/features/dataset/explorer/EntryTypeInfoDialog.vue';

const T = ddb.entry.type;
const named = Object.values(T).filter(type => type !== T.UNDEFINED);

describe('entry type descriptions', () => {
    it('names and describes every entry type but Undefined', () => {
        for (const type of named) {
            expect(getTypeDisplayName(type), `type ${type}`).not.toBe('Unknown');
            const info = getEntryTypeInfo(type);
            expect(info, `type ${type}`).not.toBeNull();
            expect(info.summary).toBeTruthy();
            expect(info.detection).toBeTruthy();
            for (const list of [info.contains, info.actions, info.examples]) {
                expect(list.length, `type ${type}`).toBeGreaterThan(0);
            }
            if (info.docsUrl) expect(info.docsUrl).toMatch(/^https:\/\/docs\.dronedb\.app\/docs\//);
        }
    });

    it('has none for Undefined or an unknown type', () => {
        expect(getEntryTypeInfo(T.UNDEFINED)).toBeNull();
        expect(getEntryTypeInfo(999)).toBeNull();
    });
});

describe('EntryTypeInfoDialog', () => {
    const mountDialog = type => mount(EntryTypeInfoDialog, {
        props: { type },
        global: {
            plugins: [PrimeVue],
            stubs: { Window: { props: ['title'], template: '<div><h2>{{ title }}</h2><slot /><slot name="footer" /></div>' } }
        }
    });

    it('shows the type, its description, examples and the documentation link', () => {
        const wrapper = mountDialog(T.GEORASTER);
        expect(wrapper.find('h2').text()).toBe('Type: GeoRaster');
        expect(wrapper.text()).toContain(getEntryTypeInfo(T.GEORASTER).summary);
        expect(wrapper.text()).toContain('An orthophoto (odm_orthophoto.tif)');
        expect(wrapper.find('a').attributes('href')).toBe('https://docs.dronedb.app/docs/reference/formats#rasters');
    });

    it('has no documentation link for a type without one, and closes on OK', async () => {
        const wrapper = mountDialog(T.DRONEDB);
        expect(wrapper.find('a').exists()).toBe(false);
        await wrapper.find('button').trigger('click');
        expect(wrapper.emitted('close')).toHaveLength(1);
    });
});
