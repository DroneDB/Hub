import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import AddLayerButton from './AddLayerButton.vue';

let wrapper;
afterEach(() => wrapper?.unmount());

describe('AddLayerButton', () => {
    it('is a native button named Add layer', () => {
        wrapper = mount(AddLayerButton);
        expect(wrapper.element.tagName).toBe('BUTTON');
        expect(wrapper.attributes('type')).toBe('button');
        expect(wrapper.text()).toBe('Add layer');
        expect(wrapper.attributes('title')).toBe('Add layer');
    });

    it('passes the click to the parent', async () => {
        let clicks = 0;
        wrapper = mount(AddLayerButton, { attrs: { onClick: () => { clicks++; } } });
        await wrapper.trigger('click');
        expect(clicks).toBe(1);
    });

    it('says why it is off in its title and does not click', async () => {
        let clicks = 0;
        wrapper = mount(AddLayerButton, { props: { disabled: true, reason: 'Up to 3 layers can be added' }, attrs: { onClick: () => { clicks++; } } });
        expect(wrapper.attributes('disabled')).toBeDefined();
        expect(wrapper.attributes('title')).toBe('Up to 3 layers can be added');
        await wrapper.trigger('click');
        expect(clicks).toBe(0);
    });
});
