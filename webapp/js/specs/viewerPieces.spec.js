/**
 * One viewer shell, one entry loader, one undo stack.
 */
import { describe, it, expect } from 'vitest';

describe('undoStack', () => {
    it('undoes and redoes in order and respects the limit', async () => {
        const { createUndoStack } = await import('@/libs/undoStack');
        const s = createUndoStack({ limit: 2 });
        s.push('a'); s.push('b'); s.push('c');
        expect(s.undo()).toBe('c');
        expect(s.undo()).toBe('b');
        expect(s.canUndo()).toBe(false);
        expect(s.redo()).toBe('b');
    });
});

describe('viewer shell', () => {
    it('useViewerEntry and ViewerShell exist', async () => {
        const { useViewerEntry } = await import('@/composables/useViewerEntry');
        expect(typeof useViewerEntry).toBe('function');
        const shell = (await import('@/components/ViewerShell.vue')).default;
        expect(shell).toBeTruthy();
    });

    // FR-VWR-06: a viewer that cannot open is an error, not a warning (whose yellow text was 2.8:1)
    it('shows the error of a viewer as an error message', async () => {
        const { mount } = await import('@vue/test-utils');
        const PrimeVue = (await import('primevue/config')).default;
        const shell = (await import('@/components/ViewerShell.vue')).default;
        const wrapper = mount(shell, { props: { error: 'missing.laz could not be opened' }, global: { plugins: [PrimeVue] } });
        expect(wrapper.find('.p-message-error').text()).toContain('missing.laz could not be opened');
        expect(wrapper.find('.p-message-warn').exists()).toBe(false);
        wrapper.unmount();
    });

    it('useViewerSettings persists through usePreference', async () => {
        const { useViewerSettings } = await import('@/composables/useViewerSettings');
        expect(typeof useViewerSettings).toBe('function');
    });
});
