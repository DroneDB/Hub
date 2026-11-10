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

    it('without pickToCompare (a view) is only the split toggle: none with one georaster, the toggle from two', () => {
        expect(render({ rasterCount: 1, canCompare: false, pickToCompare: false })).toBeNull();
        wrapper.unmount();
        const button = render({ rasterCount: 2, canCompare: true, pickToCompare: false });
        expect(button.getAttribute('aria-label')).toBe('Compare georasters side by side');
        button.click();
        expect(wrapper.emitted('toggle-split')).toHaveLength(1);
        expect(wrapper.emitted('compare-to')).toBeUndefined();
    });

    it('is not shown where the map has no compare (a single-file map)', () => {
        expect(render({ rasterCount: 1, canCompare: false, splitToggle: false })).toBeNull();
    });

    it('on an embedded map splits the georasters it has but does not pick another one', () => {
        const renderEmbedded = props => {
            wrapper = mount(MapToolbar, { props: { zones, ...props }, global: { provide: { embed: true } } });
            return zones.topCenter.querySelector(COMPARE);
        };
        expect(renderEmbedded({ rasterCount: 1, canCompare: false })).toBeNull();
        wrapper.unmount();
        const split = renderEmbedded({ rasterCount: 2, canCompare: true });
        expect(split.getAttribute('aria-label')).toBe('Compare georasters side by side');
    });
});

describe('MapToolbar analysis buttons', () => {
    const DEM = { path: 'odm_dem/dsm.tif' };
    const button = id => zones.topRight.querySelector(`[data-testid="${id}"]`);
    const mountWith = props => { wrapper = mount(MapToolbar, { props: { zones, analysisEntry: DEM, ...props } }); };

    it('are enabled with several georasters on the map, whatever their number', () => {
        mountWith({ rasterCount: 3, canCompare: true });
        for (const id of ['raster-analysis-toolbar-btn', 'stockpile-toolbar-btn']) {
            expect(button(id).disabled).toBe(false);
            expect(button(id).title).not.toMatch(/single georaster/i);
        }
    });

    it('are disabled in split compare, and the title says how to use them', () => {
        mountWith({ rasterCount: 2, canCompare: true, splitMode: true });
        expect(button('stockpile-toolbar-btn').disabled).toBe(true);
        expect(button('stockpile-toolbar-btn').title).toBe('Stockpile Volume - Turn off split compare to use this tool');
        expect(button('raster-analysis-toolbar-btn').disabled).toBe(true);
        expect(button('raster-analysis-toolbar-btn').title).toMatch(/Turn off split compare/);
    });

    // FR-MAP-24: the pile is not the stack of layers, and not the split of Compare
    it('have a mountain for the Stockpile button, apart from the icon of the Compare button', () => {
        mountWith({ rasterCount: 2, canCompare: true });
        expect(button('stockpile-toolbar-btn').querySelector('i').className).toBe('fa-solid fa-mountain');
        expect(zones.topCenter.querySelector(COMPARE).querySelector('i').className).toBe('fa-solid fa-table-columns');
    });

    it('ask for their panel', () => {
        mountWith({ rasterCount: 1 });
        button('stockpile-toolbar-btn').click();
        button('raster-analysis-toolbar-btn').click();
        expect(wrapper.emitted('analysis')).toEqual([['stockpile'], ['rasterAnalysis']]);
    });

    it('are hidden when the map has no analysis entry (no elevation raster, or split mode)', () => {
        mountWith({ rasterCount: 2, analysisEntry: null });
        expect(button('stockpile-toolbar-btn')).toBeNull();
        expect(button('raster-analysis-toolbar-btn')).toBeNull();
    });
});

describe('MapToolbar back and copy link', () => {
    const back = () => zones.topRight.querySelector('button[aria-label="Back to Dataset"]');
    const copyLink = () => zones.topRight.querySelector('button[aria-label="Copy link"]');
    const mountWith = (props, embed) => {
        wrapper = mount(MapToolbar, { props: { zones, ...props }, global: embed === undefined ? {} : { provide: { embed } } });
    };

    it('shows Back when asked, and Copy link on the map viewer', () => {
        mountWith({ showBack: true, copyLink: true });
        expect(back()).not.toBeNull();
        expect(copyLink()).not.toBeNull();
        expect(copyLink().title).toBe('Copy link');
    });

    it('has no Copy link unless asked (the dataset map)', () => {
        mountWith({ showBack: true });
        expect(copyLink()).toBeNull();
    });

    it('asks to copy the link', () => {
        mountWith({ copyLink: true });
        copyLink().click();
        expect(wrapper.emitted('copy-link')).toHaveLength(1);
    });

    it('marks Copy link as the control of the map link panel, apart from the test ids', () => {
        mountWith({ copyLink: true });
        expect(copyLink().matches('[data-map-link-toggle]')).toBe(true);
        expect(zones.topRight.querySelectorAll('[data-map-link-toggle]')).toHaveLength(1);
    });

    it('has neither Back nor Copy link on an embedded map', () => {
        mountWith({ showBack: true, copyLink: true }, true);
        expect(back()).toBeNull();
        expect(copyLink()).toBeNull();
        expect(zones.topRight.querySelector('button[aria-label="Reset View"]')).not.toBeNull();
    });

    it('keeps both when the app says the map is not embedded', () => {
        mountWith({ showBack: true, copyLink: true }, false);
        expect(back()).not.toBeNull();
        expect(copyLink()).not.toBeNull();
    });
});

describe('MapToolbar on a map narrower than sm (FR-MAP-12)', () => {
    const labels = () => [...zones.topRight.querySelectorAll('button')].map(b => b.getAttribute('aria-label'));
    const mountOn = (mapSize, props) => {
        wrapper = mount(MapToolbar, {
            props: { zones, showBack: true, copyLink: true, analysisEntry: { path: 'dsm.tif' }, rasterCount: 1, ...props },
            global: { provide: { mapSize } }
        });
    };

    it('leaves the Back button out of the rail, as the bar of the viewer has the way back', () => {
        mountOn({ narrow: true });
        expect(labels()).not.toContain('Back to Dataset');
    });

    it('keeps the rail of a map viewer at 6 buttons with the Measure toggle: Reset, Fullscreen, Copy link and the two analysis tools', () => {
        mountOn({ narrow: true });
        // Fullscreen shows where the browser supports it (jsdom: not); the other four are always there
        expect(labels().filter(l => l !== 'Fullscreen')).toEqual(['Reset View', 'Copy link', 'Raster Analysis', 'Stockpile Volume']);
        expect(labels().length + 1).toBeLessThanOrEqual(6);
    });

    it('keeps Back on a wider map', () => {
        mountOn({ narrow: false });
        expect(labels()).toContain('Back to Dataset');
    });
});
