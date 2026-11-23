import { describe, it, expect, vi, beforeEach } from 'vitest';

const notify = { warn: vi.fn(), error: vi.fn(), success: vi.fn() };
vi.mock('@/composables/useNotify', () => ({ useNotify: () => notify }));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: { getUsername: () => 'user' } }));
vi.mock('@/libs/views/viewStore', () => ({ updateView: vi.fn(), deleteView: vi.fn(), saveNewView: vi.fn(), listViews: vi.fn() }));
vi.mock('@/libs/views/viewLinks', () => ({ openInNewTab: vi.fn(), savedViewUrl: (ds, uid) => `/r/acme/site/views/${uid}` }));
vi.mock('@/components/TextPromptDialog.vue', () => ({ default: { name: 'TextPromptDialog' } }));
vi.mock('@/components/ConfirmDialog.vue', () => ({ default: { name: 'ConfirmDialog' } }));

const { updateView, deleteView, saveNewView, listViews } = await import('@/libs/views/viewStore');
const { openInNewTab } = await import('@/libs/views/viewLinks');
const { askViewName, useViewActions } = await import('./useViewActions');

const dataset = {};
const view = { uid: 'v_abcd1234', name: 'Ortho over DSM' };
let dialogs;
let onChanged;
let actions;

beforeEach(() => {
    vi.resetAllMocks();
    dialogs = { open: vi.fn() };
    onChanged = vi.fn();
    actions = useViewActions({ dataset, dialogs, onChanged });
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('askViewName', () => {
    it('asks with the Name label and the length limit of a view name', async () => {
        dialogs.open.mockResolvedValue('A');
        expect(await askViewName(dialogs, { title: 'Save view' })).toBe('A');
        const [component, props] = dialogs.open.mock.calls[0];
        expect(component.name).toBe('TextPromptDialog');
        expect(props).toEqual({ title: 'Save view', label: 'Name', initialValue: '', confirmLabel: 'Save', maxLength: 100 });
    });

    it('passes the initial value and the confirm label on', async () => {
        dialogs.open.mockResolvedValue(null);
        expect(await askViewName(dialogs, { title: 'Rename view', initialValue: 'x', confirmLabel: 'Rename' })).toBeNull();
        expect(dialogs.open.mock.calls[0][1]).toMatchObject({ initialValue: 'x', confirmLabel: 'Rename' });
    });
});

describe('useViewActions saveAsNew', () => {
    const state = { base: { path: 'odm/odm_orthophoto.tif', hash: 'h' }, layers: [] };

    it('asks for a name, the base file\'s made free among the views, saves the view and offers to open it', async () => {
        listViews.mockResolvedValue([{ name: 'odm_orthophoto.tif' }]);
        dialogs.open.mockResolvedValue('Pit');
        saveNewView.mockResolvedValue({ uid: 'v_new00000', name: 'Pit' });
        expect(await actions.saveAsNew(state)).toBe(true);
        expect(dialogs.open.mock.calls[0][1]).toMatchObject({ title: 'Save as view', initialValue: 'odm_orthophoto.tif (2)' });
        expect(saveNewView).toHaveBeenCalledWith(dataset, state, { name: 'Pit', user: 'user' });
        expect(onChanged).toHaveBeenCalledOnce();
        const [text, { action }] = notify.success.mock.calls[0];
        expect(text).toBe('View "Pit" saved');
        action.run();
        expect(openInNewTab).toHaveBeenCalledWith('/r/acme/site/views/v_new00000');
    });

    it('saves nothing when the name is cancelled, and shows a refused save', async () => {
        listViews.mockRejectedValue(new Error('offline'));
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        dialogs.open.mockResolvedValue(null);
        expect(await actions.saveAsNew(state)).toBe(false);
        expect(dialogs.open.mock.calls[0][1].initialValue).toBe('odm_orthophoto.tif');
        expect(saveNewView).not.toHaveBeenCalled();
        dialogs.open.mockResolvedValue('Pit');
        saveNewView.mockRejectedValue(new Error('This dataset has 100 views.'));
        expect(await actions.saveAsNew(state)).toBe(false);
        expect(notify.error).toHaveBeenCalledWith('This dataset has 100 views.', { summary: 'Cannot save the view' });
        expect(onChanged).not.toHaveBeenCalled();
    });
});

describe('useViewActions rename', () => {
    it('asks for the new name starting from the current one and stores it', async () => {
        dialogs.open.mockResolvedValue('Better name');
        await actions.rename(view);
        expect(dialogs.open.mock.calls[0][1]).toMatchObject({ title: 'Rename view', initialValue: 'Ortho over DSM', confirmLabel: 'Rename' });
        expect(updateView).toHaveBeenCalledWith(dataset, 'v_abcd1234', { name: 'Better name', user: 'user' });
        expect(onChanged).toHaveBeenCalledTimes(1);
    });

    it('does nothing when the name is cancelled or unchanged', async () => {
        dialogs.open.mockResolvedValueOnce(null);
        await actions.rename(view);
        dialogs.open.mockResolvedValueOnce('Ortho over DSM');
        await actions.rename(view);
        expect(updateView).not.toHaveBeenCalled();
        expect(onChanged).not.toHaveBeenCalled();
    });

    it('shows a failure with the summary and does not report a change', async () => {
        dialogs.open.mockResolvedValue('New');
        updateView.mockRejectedValue(new Error('This view was deleted.'));
        await actions.rename(view);
        expect(notify.error).toHaveBeenCalledWith('This view was deleted.', { summary: 'Cannot rename the view' });
        expect(onChanged).not.toHaveBeenCalled();
    });
});

describe('useViewActions remove', () => {
    it('confirms with the name in the title only, then deletes', async () => {
        dialogs.open.mockResolvedValue('confirm');
        await actions.remove({ uid: 'v_1', name: '<img src=x onerror=alert(1)>' });
        const [component, props] = dialogs.open.mock.calls[0];
        expect(component.name).toBe('ConfirmDialog');
        expect(props).toMatchObject({
            title: 'Delete "<img src=x onerror=alert(1)>"',
            message: 'Delete this saved view? Its links will stop working. The files are not deleted.',
            confirmText: 'Delete',
            confirmButtonClass: 'danger'
        });
        // The message is rendered as sanitised HTML: the name must stay out of it
        expect(props.message).not.toContain('onerror');
        expect(deleteView).toHaveBeenCalledWith(dataset, 'v_1');
        expect(onChanged).toHaveBeenCalledTimes(1);
    });

    it('deletes nothing when the question is cancelled', async () => {
        dialogs.open.mockResolvedValue('cancel');
        await actions.remove(view);
        expect(deleteView).not.toHaveBeenCalled();
        expect(onChanged).not.toHaveBeenCalled();
    });

    it('shows a failure with the summary', async () => {
        dialogs.open.mockResolvedValue('confirm');
        deleteView.mockRejectedValue(new Error('boom'));
        await actions.remove(view);
        expect(notify.error).toHaveBeenCalledWith('boom', { summary: 'Cannot delete the view' });
        expect(onChanged).not.toHaveBeenCalled();
    });
});
