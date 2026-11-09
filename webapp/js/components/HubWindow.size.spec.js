/**
 * HubWindow size-class and #footer (FR-XC-20): the class is on the dialog and no size is set inline, so the width is
 * the one of the class (css/app.scss) and does not follow the content; the footer is the window's own element, after
 * the content.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import Window from './HubWindow.vue';

let wrapper;
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
});

const show = async (props, slots = {}) => {
    wrapper = mount(Window, { props: { visible: true, title: 'T', ...props }, slots, attachTo: document.body, global: { plugins: [PrimeVue] } });
    await wrapper.vm.$nextTick();
    return document.querySelector('.window-dialog');
};

describe('HubWindow size-class', () => {
    it.each(['dialog-lg', 'dialog-xl', 'dialog-wide'])('puts %s on the dialog and sets no width inline', async cls => {
        const dialog = await show({ sizeClass: cls, fixedSize: true });
        expect(dialog.classList.contains(cls)).toBe(true);
        expect(dialog.getAttribute('style') || '').not.toContain('--window-width');
        expect(dialog.getAttribute('style') || '').not.toContain('--window-max-width');
    });

    it('without a class, the size asked for goes in custom properties', async () => {
        const dialog = await show({ width: '52rem', maxWidth: '95vw' });
        expect(dialog.style.getPropertyValue('--window-width')).toBe('52rem');
        expect(dialog.style.getPropertyValue('--window-max-width')).toBe('95vw');
    });

    it('renders the #footer after the content, in the .window-footer the stylesheet keeps in view', async () => {
        const dialog = await show({ sizeClass: 'dialog-xl', fixedSize: true },
            { default: '<p class="body">body</p>', footer: '<button class="mine" data-confirm>Go</button>' });
        const footer = dialog.querySelector('.window-footer');
        expect(footer.querySelector('.mine')).not.toBeNull();
        const body = dialog.querySelector('.body');
        expect(body.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        // the old spacing utility is gone: the stylesheet owns the space above the buttons
        expect(footer.classList.contains('mt-3')).toBe(false);
    });
});

describe('HubWindow maximizable (FR-PRC-44)', () => {
    it('has no maximize button by default', async () => {
        const dialog = await show({ sizeClass: 'dialog-wide', fixedSize: true });
        expect(dialog.querySelector('.p-dialog-maximize-button')).toBeNull();
    });

    it('has the maximize button of the Dialog, which makes the window fill the screen and back', async () => {
        const dialog = await show({ sizeClass: 'dialog-wide', fixedSize: true, maximizable: true });
        const button = dialog.querySelector('.p-dialog-maximize-button');
        expect(button).not.toBeNull();
        button.click();
        await wrapper.vm.$nextTick();
        expect(dialog.classList.contains('p-dialog-maximized')).toBe(true);
        button.click();
        await wrapper.vm.$nextTick();
        expect(dialog.classList.contains('p-dialog-maximized')).toBe(false);
    });
});
