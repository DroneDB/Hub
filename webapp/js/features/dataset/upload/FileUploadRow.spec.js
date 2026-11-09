/**
 * The error of an upload row (FR-UPL-07): the whole reason, two lines in the row and all of it on
 * click or Enter, read in full through aria-describedby; Retry only for a failure that can succeed.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import FileUploadRow from './FileUploadRow.vue';

const REASON = 'You do not have write access to this dataset, so the file was not added';

const row = file => mount(FileUploadRow, {
    props: { file: { id: 'u1', name: 'a.txt', size: 4, status: 'error', progress: 0, canRetry: false, ...file } },
    global: { plugins: [PrimeVue] }
});

describe('FileUploadRow', () => {
    it('shows the whole reason, not a cut one, and names it for a screen reader', () => {
        const wrapper = row({ errorMessage: REASON });

        const text = wrapper.find('.error-text');
        expect(text.text()).toBe(REASON);
        expect(text.element.tagName).toBe('BUTTON');
        expect(wrapper.find(`#${text.attributes('aria-describedby')}`).text()).toBe(REASON);
    });

    it('expands the reason on click and folds it again', async () => {
        const wrapper = row({ errorMessage: REASON });
        const text = wrapper.find('.error-text');
        expect(text.attributes('aria-expanded')).toBe('false');

        await text.trigger('click');
        expect(text.classes()).toContain('expanded');
        expect(text.attributes('aria-expanded')).toBe('true');

        await text.trigger('click');
        expect(text.classes()).not.toContain('expanded');
    });

    it('offers Retry only when the failure can succeed when sent again', () => {
        expect(row({ errorMessage: REASON, canRetry: false }).find('.retry-btn').exists()).toBe(false);
        expect(row({ errorMessage: 'Network error', canRetry: true }).find('.retry-btn').exists()).toBe(true);
    });

    it('says "Upload failed" when the server gave no reason', () => {
        expect(row({ errorMessage: '' }).find('.error-text').text()).toBe('Upload failed');
    });
});
