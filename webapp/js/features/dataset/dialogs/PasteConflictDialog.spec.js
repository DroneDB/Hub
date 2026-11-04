/**
 * The Paste Conflict window counts the files that clash in words that agree with the count.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import PasteConflictDialog from './PasteConflictDialog.vue';

const sentence = (paths) => mount(PasteConflictDialog, {
    props: { items: paths.map(path => ({ path })) },
    global: { plugins: [PrimeVue], stubs: { Window: { template: '<div><slot /></div>' } } }
}).find('p').text().replace(/\s+/g, ' ');

describe('PasteConflictDialog', () => {
    it('speaks of one file in the singular', () => {
        expect(sentence(['a/IMG_1.JPG'])).toBe(
            '1 file in the destination folder has the same name as an item being pasted. How would you like to proceed?');
    });

    it('speaks of two files in the plural', () => {
        expect(sentence(['a/IMG_1.JPG', 'a/IMG_2.JPG'])).toBe(
            '2 files in the destination folder have the same names as items being pasted. How would you like to proceed?');
    });
});
