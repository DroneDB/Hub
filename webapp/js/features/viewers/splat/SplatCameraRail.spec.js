import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import SplatCameraRail from './SplatCameraRail.vue';

const mountRail = (props = {}) => mount(SplatCameraRail, { props: { cameras: [], hasTour: true, mode: null, ...props } });
const tourButton = wrapper => wrapper.find('button[aria-label="Start cycling"], button[aria-label="Stop cycling"]');

describe('SplatCameraRail tour button', () => {
    it('highlights Start cycling with a hint while the tour waits', () => {
        const wrapper = mountRail();
        const button = tourButton(wrapper);
        expect(button.attributes('aria-label')).toBe('Start cycling');
        expect(button.classes()).toContain('waiting');
        expect(button.attributes('title')).toContain('Press P to play the tour');
        expect(wrapper.find('.rail-hint').text()).toBe('Press P to play the tour');
        expect(button.attributes('aria-describedby')).toBe(wrapper.find('.rail-hint').attributes('id'));
    });

    it('shows the hint as visible text next to the rail, not only as a tooltip or a description', () => {
        const wrapper = mount(SplatCameraRail, { props: { cameras: [], hasTour: true, mode: null }, attachTo: document.body });
        const hint = wrapper.find('.rail-hint');
        expect(hint.element.tagName).toBe('P');
        expect(hint.isVisible()).toBe(true);
        expect(hint.attributes('hidden')).toBeUndefined();
        expect(hint.attributes('aria-hidden')).toBeUndefined();
        expect(hint.classes()).not.toContain('visually-hidden');
        expect(hint.classes()).not.toContain('sr-only');
        // Outside the scrolling rail, so it is never clipped by it
        expect(wrapper.find('.camera-rail').element.contains(hint.element)).toBe(false);
        expect(wrapper.find('.camera-rail-anchor').element.contains(hint.element)).toBe(true);
        wrapper.unmount();
    });

    it('drops the highlight and the hint while the tour plays', () => {
        const wrapper = mountRail({ mode: 'tour' });
        const button = tourButton(wrapper);
        expect(button.attributes('aria-label')).toBe('Stop cycling');
        expect(button.classes()).not.toContain('waiting');
        expect(wrapper.find('.rail-hint').exists()).toBe(false);
    });

    it('shows no tour button and no hint without a tour', () => {
        const wrapper = mountRail({ hasTour: false });
        expect(tourButton(wrapper).exists()).toBe(false);
        expect(wrapper.find('.rail-hint').exists()).toBe(false);
    });

    it('asks the viewer to toggle the tour on click', async () => {
        const wrapper = mountRail();
        await tourButton(wrapper).trigger('click');
        expect(wrapper.emitted('toggle-tour')).toHaveLength(1);
    });
});
