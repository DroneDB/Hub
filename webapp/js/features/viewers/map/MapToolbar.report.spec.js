/**
 * The Report button of the map toolbar: in the top right rail after Copy link, only when the map offers it (a user who can
 * write on a map of a dataset), named for a screen reader, and it asks the map to make the report.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import MapToolbar from './MapToolbar.vue';

let wrapper;
let zones;
const mountToolbar = (props = {}) => {
    zones = { topRight: document.createElement('div'), topCenter: document.createElement('div') };
    document.body.append(zones.topRight, zones.topCenter);
    wrapper = mount(MapToolbar, { props: { zones, copyLink: true, ...props }, global: { provide: { embed: false, mapSize: { narrow: false } } } });
};
afterEach(() => {
    wrapper?.unmount();
    zones?.topRight.remove();
    zones?.topCenter.remove();
});

const buttons = () => [...zones.topRight.querySelectorAll('button')].map(b => b.getAttribute('aria-label'));
const report = () => zones.topRight.querySelector('[data-testid="report-toolbar-btn"]');

describe('the Report button', () => {
    it('is in the rail, after Copy link, with a name and the report glyph', () => {
        mountToolbar({ report: true });
        const labels = buttons();
        expect(labels).toContain('Report');
        expect(labels.indexOf('Report')).toBe(labels.indexOf('Copy link') + 1);
        expect(report().getAttribute('title')).toBe('Report');
        expect(report().querySelector('i').className).toContain('fa-file-lines');
    });

    it('is not there unless the map offers it', () => {
        mountToolbar();
        expect(buttons()).not.toContain('Report');
        expect(report()).toBeNull();
    });

    it('asks the map to make the report when pressed', () => {
        mountToolbar({ report: true });
        report().click();
        expect(wrapper.emitted('report')).toHaveLength(1);
    });
});
