import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mount } from '@vue/test-utils';
import DatasetHeader from './DatasetHeader.vue';

const style = fs.readFileSync(path.join(__dirname, 'DatasetHeader.vue'), 'utf8').split(/<style[^>]*>/)[1];
const rule = selector => style.slice(style.indexOf(`${selector} {`)).split('}')[0];

const root = (meta = {}) => ({ path: '', properties: { meta } });
const mountHeader = entry => mount(DatasetHeader, { props: { entry }, global: { stubs: { Tag: { props: ['value'], template: '<span class="p-tag">{{ value }}</span>' } } } });

describe('DatasetHeader', () => {
    it('shows the name, then the visibility, then the tagline', () => {
        const wrapper = mountHeader(root({ name: { data: 'images' }, visibility: { data: 0 }, tagline: { data: ' Drone shots ' } }));
        const row = wrapper.find('.title-row');
        expect(row.find('h1').text()).toBe('images');
        // the tag is the last item of the row, after the name
        expect(row.element.lastElementChild.classList).toContain('dataset-visibility');
        expect(row.find('.dataset-visibility').text()).toBe('Private');
        expect(wrapper.find('.dataset-tagline').text()).toBe('Drone shots');
    });

    it('shows nothing before the root entry is read', () => {
        expect(mountHeader(null).find('header').exists()).toBe(false);
    });

    it('keeps the visibility at the right edge of the row, whatever the length of the name', () => {
        // one line: the name takes the free space and breaks inside it, the tag keeps its size at the far end
        expect(rule('.title-row')).toContain('display: flex;');
        expect(rule('.title-row')).not.toContain('flex-wrap: wrap;');
        // on the first line of a name that wraps, not in the middle of it
        expect(rule('.title-row')).toContain('align-items: baseline;');
        expect(rule('.dataset-title')).toContain('flex: 1 1 auto;');
        expect(rule('.dataset-title')).toContain('min-width: 0;');
        expect(rule('.dataset-visibility')).toContain('flex: none;');
        expect(rule('.dataset-visibility')).toContain('margin-inline-start: auto;');
    });
});
