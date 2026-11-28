/**
 * The reports under the folder tree: the "Reports" group, one row per report in the order given and the unreadable ones
 * last, opening in a new tab, Copy Link for readers, and New, Edit, Duplicate and Delete for writers only. Names are text.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { h } from 'vue';
import { DOCS } from '@/libs/docsLinks';

const m = vi.hoisted(() => ({ copyText: vi.fn(() => Promise.resolve()), success: vi.fn(), error: vi.fn() }));
vi.mock('clipboard-copy', () => ({ default: m.copyText }));
vi.mock('@/composables/useNotify', () => ({ useNotify: () => ({ success: m.success, error: m.error }) }));

const ReportsList = (await import('./ReportsList.vue')).default;

const dataset = { org: 'org', ds: 'ds' };
const reports = [
    { id: '1', uid: 'r_aaaaaaaa', name: 'Alpha', data: {}, error: null },
    { id: '2', uid: 'r_bbbbbbbb', name: '<img src=x onerror=alert(1)>', data: {}, error: null }
];
const unreadable = [{ id: '9', uid: 'r_cccccccc', name: 'Broken', error: 'a source label is used twice' }, { id: '10', uid: null, name: null, error: 'not an object' }];

const ContextMenuStub = { props: ['items'], render: () => h('div', { class: 'menu-stub' }) };

function mountList(props = {}) {
    return mount(ReportsList, {
        props: { reports, dataset, canWrite: false, ...props },
        global: { stubs: { ContextMenu: ContextMenuStub } }
    });
}

const rows = w => w.findAll('ul[role="group"] li[role="treeitem"] button.entry');
const menuItems = w => w.findComponent(ContextMenuStub).props('items');
const visibleLabels = w => menuItems(w).filter(i => i.label && (!i.isVisible || i.isVisible())).map(i => i.label);
const item = (w, label) => menuItems(w).find(i => i.label === label);

beforeEach(() => vi.spyOn(window, 'open').mockReturnValue(null));
afterEach(() => {
    vi.restoreAllMocks();
    m.copyText.mockClear();
    m.success.mockClear();
    m.error.mockClear();
});

describe('ReportsList', () => {
    it('groups the reports under "Reports" with the glyph of the group, each report with the report glyph, in the order given', () => {
        const w = mountList();
        expect(w.find('button.group').text()).toBe('Reports');
        const heading = w.find('button.group').findAll('i').map(i => i.classes().join(' '));
        expect(heading).toContain('icon fa-solid fa-clipboard-list');
        expect(heading.join(' ')).not.toContain('fa-file-lines');
        expect(rows(w).map(r => r.find('i.icon').classes().join(' '))).toEqual(['icon fa-solid fa-file-lines', 'icon fa-solid fa-file-lines']);
        expect(w.find('[role="tree"]').attributes('aria-label')).toBe('Reports');
        expect(rows(w).map(r => r.attributes('title'))).toEqual(['Alpha (double-click to open)', '<img src=x onerror=alert(1)> (double-click to open)']);
    });

    it('shows a name as text, whatever it contains', () => {
        const w = mountList();
        expect(w.find('img').exists()).toBe(false);
        expect(rows(w)[1].text()).toBe('<img src=x onerror=alert(1)>');
    });

    it('lists the reports that cannot be read last, with a warning glyph and the reason, named by what is known of them', () => {
        const w = mountList({ unreadable });
        const list = rows(w);
        expect(list.map(r => r.text())).toEqual(['Alpha', '<img src=x onerror=alert(1)>', 'Broken', 'Report that cannot be read']);
        expect(list[2].find('i').classes()).toContain('fa-triangle-exclamation');
        expect(list[2].attributes('title')).toBe('Broken cannot be read: a source label is used twice');
    });

    it('opens the report in a new tab on double click and on Enter, and an unreadable one opens nothing', async () => {
        const w = mountList({ unreadable });
        await rows(w)[0].trigger('dblclick');
        expect(window.open).toHaveBeenLastCalledWith('/r/org/ds/reports/r_aaaaaaaa', '_blank', 'noopener');
        await rows(w)[1].trigger('keydown', { key: 'Enter' });
        expect(window.open).toHaveBeenLastCalledWith('/r/org/ds/reports/r_bbbbbbbb', '_blank', 'noopener');
        window.open.mockClear();
        await rows(w)[2].trigger('dblclick');
        expect(window.open).not.toHaveBeenCalled();
    });

    it('copies the absolute link and says so, naming the report as text', async () => {
        const w = mountList();
        await rows(w)[0].trigger('contextmenu');
        await item(w, 'Copy Link').click();
        expect(m.copyText).toHaveBeenCalledWith(`${window.location.origin}/r/org/ds/reports/r_aaaaaaaa`);
        expect(m.success).toHaveBeenCalledWith('Link copied to the clipboard', { summary: 'Alpha' });
    });

    it('offers only Open and Copy Link to a reader, and no New report', async () => {
        const w = mountList({ canWrite: false });
        await rows(w)[0].trigger('contextmenu');
        expect(visibleLabels(w)).toEqual(['Open', 'Copy Link']);
        expect(w.find('[data-testid="group-action"]').exists()).toBe(false);
    });

    it('offers nothing before a report is chosen', () => {
        expect(visibleLabels(mountList({ canWrite: true }))).toEqual([]);
    });

    it('lets a writer edit, duplicate and delete, asking the page to do it', async () => {
        const w = mountList({ canWrite: true });
        await rows(w)[0].trigger('contextmenu');
        expect(visibleLabels(w)).toEqual(['Open', 'Copy Link', 'Edit', 'Duplicate', 'Delete']);
        item(w, 'Edit').click();
        item(w, 'Duplicate').click();
        item(w, 'Delete').click();
        expect(w.emitted('edit')[0][0]).toMatchObject({ uid: 'r_aaaaaaaa' });
        expect(w.emitted('duplicate')[0][0]).toMatchObject({ uid: 'r_aaaaaaaa' });
        expect(w.emitted('delete')[0][0]).toMatchObject({ uid: 'r_aaaaaaaa' });
    });

    it('offers no Edit or Duplicate for a report of a newer version: saving it would lose what this version does not know', async () => {
        const w = mountList({ canWrite: true, reports: [{ ...reports[0], newerVersion: true }] });
        await rows(w)[0].trigger('contextmenu');
        expect(visibleLabels(w)).toEqual(['Open', 'Copy Link', 'Delete']);
    });

    it('lets a writer only delete a report that cannot be read', async () => {
        const w = mountList({ canWrite: true, unreadable });
        await rows(w)[2].trigger('contextmenu');
        expect(visibleLabels(w)).toEqual(['Delete']);
        item(w, 'Delete').click();
        expect(w.emitted('delete')[0][0]).toMatchObject({ id: '9', error: 'a source label is used twice' });
    });

    it('lets a writer start a new report, with nothing chosen, even when the dataset has none', async () => {
        const w = mountList({ canWrite: true, reports: [] });
        await w.find('[data-testid="group-action"]').trigger('click');
        expect(w.find('[data-testid="group-action"]').text()).toBe('New report');
        expect(w.emitted('new')).toHaveLength(1);
    });

    it('has an (i) button at the right of the heading that opens the dialog about reports, for readers and writers', async () => {
        const InfoDialogStub = { name: 'InfoDialog', props: ['id', 'title', 'icon', 'summary', 'sections', 'docsUrl'], template: '<div class="info-stub" />' };
        for (const canWrite of [false, true]) {
            const w = mount(ReportsList, {
                props: { reports, dataset, canWrite },
                global: { stubs: { ContextMenu: ContextMenuStub, InfoDialog: InfoDialogStub } }
            });
            const button = w.find('.group-header [data-testid="group-info"]');
            expect(button.attributes('aria-label')).toBe('About reports');
            expect(w.findComponent(InfoDialogStub).exists()).toBe(false);
            await button.trigger('click');
            const dialog = w.findComponent(InfoDialogStub);
            expect(dialog.props('title')).toBe('About reports');
            expect(dialog.props('icon')).toBe('fa-solid fa-clipboard-list');
            expect(dialog.props('summary')).toContain('A report turns the measurements');
            expect(dialog.props('docsUrl')).toBe(DOCS.reports);
            expect(dialog.props('sections').length).toBeGreaterThan(0);
            await dialog.vm.$emit('close');
            expect(w.findComponent(InfoDialogStub).exists()).toBe(false);
            // The button is not a row of the group
            expect(rows(w).every(r => r.attributes('data-testid') !== 'group-info')).toBe(true);
        }
    });
});
