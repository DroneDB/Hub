/**
 * The Paste Conflict window counts the files that clash in words that agree with the count, and
 * resolves with one choice for all of them. With `keepBoth` (uploads, FR-UPL-03) it asks file by
 * file (Replace / Keep both / Skip) with Apply to all, and resolves with one choice per file.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import PasteConflictDialog from './PasteConflictDialog.vue';

const open = (paths, props = {}) => mount(PasteConflictDialog, {
    props: { items: paths.map(path => ({ path })), ...props },
    global: { plugins: [PrimeVue], stubs: { Window: { props: ['title'], template: '<div><h1>{{ title }}</h1><slot /><slot name="footer" /></div>' } } }
});
const sentence = (paths) => open(paths).find('p').text().replace(/\s+/g, ' ');
const button = (wrapper, label) => wrapper.findAll('button').find(b => b.text() === label);

describe('PasteConflictDialog', () => {
    it('speaks of one file in the singular', () => {
        expect(sentence(['a/IMG_1.JPG'])).toBe(
            '1 file in the destination folder has the same name as an item being pasted. How would you like to proceed?');
    });

    it('speaks of two files in the plural', () => {
        expect(sentence(['a/IMG_1.JPG', 'a/IMG_2.JPG'])).toBe(
            '2 files in the destination folder have the same names as items being pasted. How would you like to proceed?');
    });

    it('pastes as before: Paste Conflict, one choice for all, no Keep both', async () => {
        const wrapper = open(['a/IMG_1.JPG', 'a/IMG_2.JPG']);
        expect(wrapper.find('h1').text()).toBe('Paste Conflict');
        expect(button(wrapper, 'Keep both')).toBeUndefined();

        await button(wrapper, 'Overwrite All').trigger('click');
        await button(wrapper, 'Skip All').trigger('click');
        await button(wrapper, 'Cancel').trigger('click');

        expect(wrapper.emitted('resolve')).toEqual([['overwrite'], ['skip'], ['cancel']]);
    });

    // A move inside one dataset cannot replace (the Registry answers 409, D-040): Keep both or Skip only
    describe('without Replace (a move inside one dataset)', () => {
        const move = paths => open(paths, { verb: 'move', keepBoth: true, replace: false });

        it('offers Keep both and Skip, no Replace or Overwrite, and resolves one choice per file', async () => {
            const wrapper = move(['photos/a.tif', 'photos/b.tif']);
            expect(wrapper.find('h1').text()).toBe('Move Conflict');
            expect(wrapper.text()).toContain('being moved');
            expect(wrapper.text()).not.toContain('Replace it');
            expect(wrapper.findAll('button').map(b => b.text())).toEqual(['Cancel', 'Skip', 'Keep both']);
            expect(button(wrapper, 'Replace')).toBeUndefined();
            expect(button(wrapper, 'Overwrite All')).toBeUndefined();

            await button(wrapper, 'Keep both').trigger('click');
            await button(wrapper, 'Skip').trigger('click');
            expect(wrapper.emitted('resolve')).toEqual([[['keep', 'skip']]]);
        });
    });

    describe('with Keep both (uploads)', () => {
        const upload = paths => open(paths, { verb: 'upload', keepBoth: true });

        it('names the verb and the file, and asks file by file', async () => {
            const wrapper = upload(['docs/a.txt', 'b.txt']);
            expect(wrapper.find('h1').text()).toBe('Upload Conflict');
            expect(wrapper.text()).toContain('a.txt');
            expect(wrapper.text()).toContain('the folder docs');
            expect(wrapper.text()).toContain('being uploaded');
            expect(wrapper.text()).toContain('Conflict 1 of 2');

            await button(wrapper, 'Keep both').trigger('click');
            expect(wrapper.emitted('resolve')).toBeUndefined();
            expect(wrapper.text()).toContain('Conflict 2 of 2');
            expect(wrapper.text()).toContain('this folder');

            await button(wrapper, 'Replace').trigger('click');
            expect(wrapper.emitted('resolve')).toEqual([[['keep', 'replace']]]);
        });

        it('applies one choice to the rest with Apply to all', async () => {
            const wrapper = upload(['a.txt', 'b.txt', 'c.txt']);

            await button(wrapper, 'Replace').trigger('click');
            await wrapper.find('#conflict-apply-all').setValue(true);
            await button(wrapper, 'Skip').trigger('click');

            expect(wrapper.emitted('resolve')).toEqual([[['replace', 'skip', 'skip']]]);
        });

        it('offers no Apply to all for one file, and Cancel cancels', async () => {
            const wrapper = upload(['a.txt']);
            expect(wrapper.find('#conflict-apply-all').exists()).toBe(false);

            await button(wrapper, 'Cancel').trigger('click');

            expect(wrapper.emitted('resolve')).toEqual([['cancel']]);
        });
    });
});
