/**
 * The actions on the reports of a dataset: open and copy the link, the editor (a new report moves to its page), a
 * duplicate, and a delete after the question, for a report and for an item that cannot be read as one.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({
    copyText: vi.fn(() => Promise.resolve()), success: vi.fn(), error: vi.fn(),
    deleteReport: vi.fn(), deleteUnreadableReport: vi.fn(), saveNewReport: vi.fn()
}));
vi.mock('clipboard-copy', () => ({ default: m.copyText }));
vi.mock('@/composables/useNotify', () => ({ useNotify: () => ({ success: m.success, error: m.error }) }));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: { getUsername: () => 'jdoe' } }));
vi.mock('@/libs/reports/reportStore', async importOriginal => ({
    ...await importOriginal(),
    deleteReport: (...a) => m.deleteReport(...a),
    deleteUnreadableReport: (...a) => m.deleteUnreadableReport(...a),
    saveNewReport: (...a) => m.saveNewReport(...a)
}));

const { useReportActions, copyName } = await import('./useReportActions');
const { NEWER_REPORT_TEXT } = await import('@/libs/reports/reportStore');

const entry = { id: '1', uid: 'r_aaaaaaaa', name: 'Alpha "quoted"', data: { version: 1, uid: 'r_aaaaaaaa', name: 'Alpha "quoted"', sources: [] }, error: null };

let dialogs;
let router;
let answers;
let onChanged;
let actions;
beforeEach(() => {
    Object.values(m).forEach(fn => fn.mockReset());
    m.copyText.mockResolvedValue();
    vi.spyOn(window, 'open').mockReturnValue(null);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    answers = { confirm: 'confirm', editor: null };
    dialogs = {
        // The question is a ConfirmDialog (it has a message); anything else is the editor
        open: vi.fn(async (component, props) => (props.message ? answers.confirm : answers.editor))
    };
    router = { push: vi.fn(async () => {}) };
    onChanged = vi.fn();
    actions = useReportActions({ dataset: { name: 'dataset' }, org: 'org', ds: 'ds', dialogs, router, onChanged });
});

describe('copyName', () => {
    it('puts "(copy)" after the name and keeps it within the length of a name', () => {
        expect(copyName('Alpha')).toBe('Alpha (copy)');
        expect(copyName('x'.repeat(100))).toHaveLength(100);
        expect(copyName('x'.repeat(100)).endsWith(' (copy)')).toBe(true);
    });
});

describe('open and copy the link', () => {
    it('opens the live page in a new tab', () => {
        actions.open(entry);
        expect(window.open).toHaveBeenCalledWith('/r/org/ds/reports/r_aaaaaaaa', '_blank', 'noopener');
    });

    it('copies the absolute link and names the report as text', async () => {
        await actions.copyLink(entry);
        expect(m.copyText).toHaveBeenCalledWith(`${window.location.origin}/r/org/ds/reports/r_aaaaaaaa`);
        expect(m.success).toHaveBeenCalledWith('Link copied to the clipboard', { summary: 'Alpha "quoted"' });
    });
});

describe('the editor', () => {
    it('opens for a new report with what it starts from, and takes the user to the report once it is saved', async () => {
        answers.editor = { uid: 'r_newnewne' };
        const initial = { sources: ['a/measurements.geojson'], cover: { viewId: 'v_cover123' } };
        const saved = await actions.create(initial);
        expect(saved).toEqual({ uid: 'r_newnewne' });
        const [, props] = dialogs.open.mock.calls[0];
        expect(props).toMatchObject({ entry: null, initial, user: 'jdoe' });
        expect(typeof props.choose).toBe('function');
        expect(router.push).toHaveBeenCalledWith('/r/org/ds/reports/r_newnewne');
        expect(onChanged).toHaveBeenCalled();
    });

    it('does not move anywhere when the editor is closed without a report', async () => {
        answers.editor = null;
        expect(await actions.create()).toBeNull();
        expect(router.push).not.toHaveBeenCalled();
        expect(onChanged).not.toHaveBeenCalled();
    });

    it('opens on the stored report to edit it, and tells the page it changed', async () => {
        answers.editor = { uid: 'r_aaaaaaaa' };
        await actions.edit(entry);
        expect(dialogs.open.mock.calls[0][1]).toMatchObject({ entry });
        expect(router.push).not.toHaveBeenCalled();
        expect(onChanged).toHaveBeenCalled();
    });
});

describe('duplicate', () => {
    it('stores the same definition under "<name> (copy)", as the user, and tells the page', async () => {
        m.saveNewReport.mockResolvedValue({});
        expect(await actions.duplicate(entry)).toBe(true);
        const [ds, definition, options] = m.saveNewReport.mock.calls[0];
        expect(ds).toEqual({ name: 'dataset' });
        expect(definition).toEqual({ ...entry.data, name: 'Alpha "quoted" (copy)' });
        expect(options).toEqual({ user: 'jdoe' });
        expect(onChanged).toHaveBeenCalled();
    });

    it('refuses a report of a newer version, with the reason, and stores nothing', async () => {
        expect(await actions.duplicate({ ...entry, newerVersion: true })).toBe(false);
        expect(m.saveNewReport).not.toHaveBeenCalled();
        expect(m.error).toHaveBeenCalledWith(NEWER_REPORT_TEXT, { summary: 'Cannot duplicate the report' });
        expect(onChanged).not.toHaveBeenCalled();
    });

    it('shows the refusal of the store (100 reports) and stores nothing more', async () => {
        m.saveNewReport.mockRejectedValue(new Error('This dataset has 100 reports. Delete one to save a new report.'));
        expect(await actions.duplicate(entry)).toBe(false);
        expect(m.error).toHaveBeenCalledWith('This dataset has 100 reports. Delete one to save a new report.', { summary: 'Cannot duplicate the report' });
        expect(onChanged).not.toHaveBeenCalled();
    });
});

describe('delete', () => {
    it('asks first, with the name in the title and never in the message, and deletes the report', async () => {
        m.deleteReport.mockResolvedValue();
        expect(await actions.remove(entry)).toBe(true);
        const [, props] = dialogs.open.mock.calls[0];
        expect(props.title).toBe('Delete "Alpha "quoted""');
        expect(props.message).not.toContain('Alpha');
        expect(props.confirmButtonClass).toBe('danger');
        expect(m.deleteReport).toHaveBeenCalledWith({ name: 'dataset' }, 'r_aaaaaaaa');
        expect(onChanged).toHaveBeenCalled();
    });

    it('deletes nothing when the user says no', async () => {
        answers.confirm = 'cancel';
        expect(await actions.remove(entry)).toBe(false);
        expect(m.deleteReport).not.toHaveBeenCalled();
        expect(onChanged).not.toHaveBeenCalled();
    });

    it('deletes an item that cannot be read as a report by its meta id or its uid, with its own title', async () => {
        const broken = { id: '10', uid: null, name: null, error: 'not an object' };
        m.deleteUnreadableReport.mockResolvedValue();
        expect(await actions.remove(broken)).toBe(true);
        expect(dialogs.open.mock.calls[0][1].title).toBe('Delete the report that cannot be read');
        expect(m.deleteUnreadableReport).toHaveBeenCalledWith({ name: 'dataset' }, broken);
        expect(m.deleteReport).not.toHaveBeenCalled();
    });

    it('shows the failure and does not tell the page it changed', async () => {
        m.deleteReport.mockRejectedValue(new Error('offline'));
        expect(await actions.remove(entry)).toBe(false);
        expect(m.error).toHaveBeenCalledWith('offline', { summary: 'Cannot delete the report' });
        expect(onChanged).not.toHaveBeenCalled();
    });
});
