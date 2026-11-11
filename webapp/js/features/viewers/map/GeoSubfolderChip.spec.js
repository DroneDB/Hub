/** The chip over the empty map of a folder whose subfolder has the photos (FR-MAP-10). */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import GeoSubfolderChip from './GeoSubfolderChip.vue';

describe('GeoSubfolderChip', () => {
    it('says where the photos are and offers Show', async () => {
        const wrapper = mount(GeoSubfolderChip, { props: { text: 'Photos are in images/', folder: 'images' } });
        expect(wrapper.text()).toBe('Photos are in images/ Show');
        const show = wrapper.find('button');
        expect(show.attributes('aria-label')).toBe('Show images/ on the map');
        await show.trigger('click');
        expect(wrapper.emitted('show')).toHaveLength(1);
    });

    it('is a status, so a screen reader hears it when the map comes up empty', () => {
        const wrapper = mount(GeoSubfolderChip, { props: { text: 'Photos are in images/', folder: 'images' } });
        expect(wrapper.attributes('role')).toBe('status');
    });
});
