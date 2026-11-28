/**
 * The Reset and Original buttons of the footer of Raster Analysis and Plant Health: drawn the same in both panels, Original a
 * toggle with the pressed look of a tool, both told to the panel as events.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import StyleViewActions from './StyleViewActions.vue';

let wrapper;
const render = (props = {}) => {
    wrapper = mount(StyleViewActions, { props: { resetTitle: 'Reset the style', ...props } });
    return wrapper;
};
const reset = () => wrapper.get('[data-testid="style-view-reset"]');
const original = () => wrapper.get('[data-testid="style-view-original"]');
afterEach(() => wrapper?.unmount());

describe('StyleViewActions', () => {
    it('draws Reset and Original as two footer buttons, with no box of their own', () => {
        render();
        expect(wrapper.findAll('button').map(b => b.text())).toEqual(['Reset', 'Original']);
        for (const button of wrapper.findAll('button')) {
            expect(button.attributes('type')).toBe('button');
            expect(button.classes()).toEqual(expect.arrayContaining(['panel-btn', 'footer-btn']));
            expect(button.find('.footer-label').exists()).toBe(true);
        }
    });

    it('gives Reset the title of the panel, and an accessible name only when it is given one', async () => {
        render();
        expect(reset().attributes('title')).toBe('Reset the style');
        expect(reset().attributes('aria-label')).toBeUndefined();
        await wrapper.setProps({ resetAriaLabel: 'Reset the style' });
        expect(reset().attributes('aria-label')).toBe('Reset the style');
    });

    it('presses Original while the original is shown, with its label and title', async () => {
        render({ originalAriaLabel: 'Original raster (no styling applied)' });
        expect(original().attributes('aria-pressed')).toBe('false');
        expect(original().classes()).not.toContain('is-active');
        expect(original().attributes('title')).toBe('Show the original raster (no styling applied)');
        expect(original().attributes('aria-label')).toBe('Original raster (no styling applied)');
        await wrapper.setProps({ originalView: true });
        expect(original().attributes('aria-pressed')).toBe('true');
        expect(original().classes()).toContain('is-active');
        expect(original().classes()).not.toContain('panel-btn--primary');
        expect(original().text()).toBe('Hide orig.');
        expect(original().attributes('title')).toBe('Show the analyzed raster');
    });

    it('tells the panel which button was pressed', async () => {
        render();
        await reset().trigger('click');
        await original().trigger('click');
        expect(wrapper.emitted('reset')).toHaveLength(1);
        expect(wrapper.emitted('toggleOriginal')).toHaveLength(1);
    });
});
