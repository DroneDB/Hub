/**
 * The Report button of the map toolbar: in the top right rail after Copy link, only when the map offers it (a user who can
 * write on a map of a dataset), named for a screen reader, and it asks the map to make the report. Save as view (the
 * dataset map) follows it, and says why it cannot save while the map shows no georaster.
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

describe('the Save as view button', () => {
    const saveView = () => zones.topRight.querySelector('[data-testid="save-view-toolbar-btn"]');

    it('follows Report when the map offers it, named, with what a view is for in its title, and asks the map to save', () => {
        mountToolbar({ report: true, saveView: true });
        const labels = buttons();
        expect(labels.indexOf('Save as view')).toBe(labels.indexOf('Report') + 1);
        expect(saveView().getAttribute('title')).toContain('to reuse in links and reports');
        saveView().click();
        expect(wrapper.emitted('save-view')).toHaveLength(1);
    });

    it('is not there unless the map offers it', () => {
        mountToolbar({ report: true });
        expect(saveView()).toBeNull();
    });

    it('keeps its title, which says why, and does nothing while the map shows no georaster', () => {
        mountToolbar({ saveView: true, saveViewDisabled: true });
        expect(saveView().getAttribute('aria-disabled')).toBe('true');
        expect(saveView().getAttribute('title')).toContain('the map shows no georaster');
        saveView().click();
        expect(wrapper.emitted('save-view')).toBeUndefined();
    });
});
