import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import MapToolbar from './MapToolbar.vue';

const COMPARE = 'button[aria-label^="Compare"]';
let zones;
let wrapper;

beforeEach(() => {
    zones = { topRight: document.createElement('div'), topCenter: document.createElement('div') };
    document.body.append(zones.topRight, zones.topCenter);
});

afterEach(() => {
    wrapper?.unmount();
    zones.topRight.remove();
    zones.topCenter.remove();
});

const render = props => {
    wrapper = mount(MapToolbar, { props: { zones, ...props } });
    return zones.topCenter.querySelector(COMPARE);
};

describe('MapToolbar compare button', () => {
    it('is not shown when the map has no georaster', () => {
        expect(render({ rasterCount: 0, canCompare: false })).toBeNull();
    });

    it('with one georaster it asks for another to compare to', async () => {
        const button = render({ rasterCount: 1, canCompare: false });
        expect(button).not.toBeNull();
        expect(button.disabled).toBe(false);
        expect(button.getAttribute('aria-label')).toBe('Compare to another georaster');
        button.click();
        expect(wrapper.emitted('compare-to')).toHaveLength(1);
        expect(wrapper.emitted('toggle-split')).toBeUndefined();
    });

    it('with two georasters or more it splits the map between them', () => {
        const button = render({ rasterCount: 2, canCompare: true });
        expect(button.getAttribute('aria-label')).toBe('Compare georasters side by side');
        button.click();
        expect(wrapper.emitted('toggle-split')).toHaveLength(1);
        expect(wrapper.emitted('compare-to')).toBeUndefined();
    });

    it('is not shown where the map has no compare (a single-file map)', () => {
        expect(render({ rasterCount: 1, canCompare: false, splitToggle: false })).toBeNull();
    });
});
