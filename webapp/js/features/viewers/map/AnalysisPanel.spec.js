/**
 * The shell of the analysis panels: the header every panel shares, and on a phone the button that
 * folds the sheet to its header. The fold keeps the content mounted, so a form, a detection in
 * progress or a selected pile survives it.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import AnalysisPanel from './AnalysisPanel.vue';

const mountPanel = (props = {}, attrs = {}) => mount(AnalysisPanel, {
    props: { icon: 'fas fa-leaf', title: 'Plant Health', variant: 'plant-health', ...props },
    attrs,
    slots: { default: '<div class="panel-body"><input class="kept"></div>' }
});

describe('AnalysisPanel', () => {
    it('shows the icon and the title in the header and takes its accent from the variant', () => {
        const wrapper = mountPanel();
        expect(wrapper.find('.panel-title i').classes()).toEqual(['fas', 'fa-leaf']);
        expect(wrapper.find('.panel-title').text()).toBe('Plant Health');
        expect(wrapper.classes()).toEqual(expect.arrayContaining(['analysis-panel', 'analysis-panel--plant-health']));
        expect(mountPanel({ variant: 'stockpile' }).classes()).toContain('analysis-panel--stockpile');
    });

    it('emits close from the close button', async () => {
        const wrapper = mountPanel();
        const close = wrapper.find('.close-btn');
        expect(close.attributes('aria-label')).toBe('Close');
        expect(close.attributes('title')).toBe('Close');
        await close.trigger('click');
        expect(wrapper.emitted('close')).toHaveLength(1);
    });

    it('opens unfolded and the toggle folds and unfolds it', async () => {
        const wrapper = mountPanel();
        const toggle = wrapper.find('.sheet-toggle');
        expect(wrapper.classes()).not.toContain('is-minimised');
        expect(toggle.attributes('aria-expanded')).toBe('true');
        expect(toggle.attributes('aria-label')).toBe('Minimise');
        expect(toggle.find('i').classes()).toContain('fa-chevron-down');

        await toggle.trigger('click');
        expect(wrapper.classes()).toContain('is-minimised');
        expect(toggle.attributes('aria-expanded')).toBe('false');
        expect(toggle.attributes('aria-label')).toBe('Expand');
        expect(toggle.attributes('title')).toBe('Expand');
        expect(toggle.find('i').classes()).toContain('fa-chevron-up');

        await toggle.trigger('click');
        expect(wrapper.classes()).not.toContain('is-minimised');
        expect(toggle.attributes('aria-expanded')).toBe('true');
    });

    it('keeps the content mounted while it is folded: the same elements, not new ones', async () => {
        const wrapper = mountPanel();
        const input = wrapper.find('.kept').element;
        await wrapper.find('.sheet-toggle').trigger('click');
        expect(wrapper.find('.kept').exists()).toBe(true);
        expect(wrapper.find('.kept').element).toBe(input);
    });

    it('keeps the classes and the test id the panel is given on its root', () => {
        const wrapper = mountPanel({}, { class: 'stockpile-panel', 'data-testid': 'stockpile-panel' });
        expect(wrapper.classes()).toEqual(expect.arrayContaining(['analysis-panel', 'stockpile-panel']));
        expect(wrapper.attributes('data-testid')).toBe('stockpile-panel');
    });

    it('opens unfolded again when it is mounted again', async () => {
        const first = mountPanel();
        await first.find('.sheet-toggle').trigger('click');
        expect(first.classes()).toContain('is-minimised');
        expect(mountPanel().classes()).not.toContain('is-minimised');
    });
});
