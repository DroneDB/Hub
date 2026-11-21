import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import DatasetHeader from './DatasetHeader.vue';

const root = (meta = {}) => ({ path: 'shore', properties: { meta } });
const mountHeader = entry => mount(DatasetHeader, { props: { entry } });

describe('DatasetHeader', () => {
    it('is the heading of the page for screen readers only: the name shows in the header of the Hub', () => {
        const wrapper = mountHeader(root({ name: { data: 'images' }, visibility: { data: 0 }, tagline: { data: 'Drone shots' } }));
        const heading = wrapper.find('h1');
        expect(heading.text()).toBe('images');
        expect(heading.classes()).toEqual(['visually-hidden']);
        // the visibility and the tagline are in the breadcrumb (VisibilityButton, the tooltip of the name)
        expect(wrapper.text()).not.toContain('Private');
        expect(wrapper.text()).not.toContain('Drone shots');
    });

    it('names the dataset by its slug when it has no display name', () => {
        expect(mountHeader(root()).find('h1').text()).toBe('shore');
    });

    it('shows nothing before the root entry is read', () => {
        expect(mountHeader(null).find('h1').exists()).toBe(false);
    });
});
