import { describe, it, expect } from 'vitest';
import { deleteConfirmation, confirmDialogProps, namedItem, LISTED_NAMES } from './deleteConfirmation';

describe('deleteConfirmation', () => {
    it('names one item in the title, with Delete / Cancel, as a danger question', () => {
        const q = deleteConfirmation({ kind: 'dataset', items: ['Survey 2026'] });
        expect(q).toMatchObject({ title: 'Delete dataset “Survey 2026”', confirmText: 'Delete', cancelText: 'Cancel', danger: true, requireText: '' });
        expect(q.message).toContain('<strong>Survey 2026</strong>');
        expect(q.message).toContain('This cannot be undone.');
    });

    it('counts several items in the title and lists them, with "and N more"', () => {
        const names = Array.from({ length: LISTED_NAMES + 2 }, (_, i) => `f${i}.jpg`);
        const q = deleteConfirmation({ kind: 'file', items: names });
        expect(q.title).toBe(`Delete ${names.length} items`);
        expect(q.message).toContain('<strong>f0.jpg</strong>');
        expect(q.message).not.toContain(`f${LISTED_NAMES}.jpg`);
        expect(q.message).toContain('and 2 more');
    });

    it('escapes the names in the message only (the title is plain text)', () => {
        const q = deleteConfirmation({ kind: 'file', items: [{ name: '<img src=x>', note: '& co' }] });
        expect(q.title).toBe('Delete file “<img src=x>”');
        expect(q.message).toContain('&lt;img src=x&gt;');
        expect(q.message).toContain('&amp; co');
        expect(q.message).not.toContain('<img');
    });

    it('says what goes with the items', () => {
        const q = deleteConfirmation({ kind: 'user', items: ['alice'], lost: ['2 organizations', '', '3 datasets'] });
        expect(q.message).toContain('Also deleted: 2 organizations, 3 datasets.');
        const folder = deleteConfirmation({ kind: 'folder', items: [{ name: 'newdir', note: 'and everything inside it' }] });
        expect(folder.message).toContain('<strong>newdir</strong> and everything inside it');
    });

    it('asks for the name of one item, the count of several, or the given text', () => {
        expect(deleteConfirmation({ kind: 'user', items: ['alice'], typed: true }).requireText).toBe('alice');
        expect(deleteConfirmation({ kind: 'file', items: ['a', 'b', 'c'], typed: true }).requireText).toBe('3');
        expect(deleteConfirmation({ kind: 'organization', items: [{ name: 'Acme', note: '(acme)' }], typed: 'acme' }).requireText).toBe('acme');
    });

    it('puts a warning under the body', () => {
        const q = deleteConfirmation({ kind: 'dataset', items: ['d'], warning: 'All the files will be deleted too.' });
        expect(q).toMatchObject({ warningTitle: 'This cannot be undone.', warningMessage: 'All the files will be deleted too.' });
        expect(q.message).not.toContain('This cannot be undone.');
    });

    it('names items without names of their own by a description', () => {
        const q = deleteConfirmation({ kind: 'saved measurements', description: 'the saved measurements of <this> view' });
        expect(q.title).toBe('Delete saved measurements');
        expect(q.message).toContain('This deletes the saved measurements of &lt;this&gt; view.');
    });

    it('shows a slug after a display name that differs', () => {
        expect(namedItem('Acme', 'acme')).toEqual({ name: 'Acme', note: '(acme)' });
        expect(namedItem('', 'acme')).toEqual({ name: 'acme', note: '' });
    });

    it('gives the same question as ConfirmDialog props', () => {
        const props = confirmDialogProps({ kind: 'role', items: ['editor'] });
        expect(props).toMatchObject({ title: 'Delete role “editor”', confirmText: 'Delete', cancelText: 'Cancel', confirmButtonClass: 'danger' });
        expect(props).not.toHaveProperty('danger');
    });
});
