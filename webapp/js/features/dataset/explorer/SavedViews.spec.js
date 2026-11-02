/**
 * The saved views under the folder tree: the "Views" group, one row per view in the order given,
 * opening in a new tab, Copy Link, and Rename / Delete for writers only. Names are text.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { h } from 'vue';

const m = vi.hoisted(() => ({ copyText: vi.fn(() => Promise.resolve()), success: vi.fn(), error: vi.fn() }));
vi.mock('@/composables/useCopyText', () => ({ copyText: m.copyText }));
vi.mock('@/composables/useNotify', () => ({ useNotify: () => ({ success: m.success, error: m.error }) }));

const SavedViews = (await import('./SavedViews.vue')).default;

const dataset = { org: 'org', ds: 'ds' };
const views = [
    { uid: 'v_aaaaaaaa', name: 'Alpha' },
    { uid: 'v_bbbbbbbb', name: 'Beta' },
    { uid: 'v_cccccccc', name: '<img src=x onerror=alert(1)>' }
];

// The menu is the page's own ContextMenu; the stub keeps its items to run them
const ContextMenuStub = { props: ['items'], render: () => h('div', { class: 'menu-stub' }) };

function mountViews(props = {}) {
    return mount(SavedViews, {
        props: { views, dataset, canWrite: false, ...props },
        global: { stubs: { ContextMenu: ContextMenuStub } }
    });
}

const rows = w => w.findAll('ul[role="group"] button.entry');
const menuItems = w => w.findComponent(ContextMenuStub).props('items');
const visibleLabels = w => menuItems(w).filter(i => i.label && (!i.isVisible || i.isVisible())).map(i => i.label);
const item = (w, label) => menuItems(w).find(i => i.label === label);

describe('SavedViews', () => {
    beforeEach(() => {
        vi.spyOn(window, 'open').mockReturnValue(null);
    });
    afterEach(() => {
        vi.restoreAllMocks();
        m.copyText.mockClear();
        m.success.mockClear();
        m.error.mockClear();
    });

    it('groups the views under "Views" and lists them in the order given', () => {
        const w = mountViews();
        expect(w.find('button.group').text()).toBe('Views');
        expect(rows(w).map(r => r.attributes('title'))).toEqual([
            'Alpha (double-click to open)',
            'Beta (double-click to open)',
            '<img src=x onerror=alert(1)> (double-click to open)'
        ]);
    });

    it('shows a name as text, whatever it contains', () => {
        const w = mountViews();
        expect(w.find('img').exists()).toBe(false);
        expect(rows(w)[2].text()).toBe('<img src=x onerror=alert(1)>');
    });

    it('collapses and expands the group', async () => {
        const w = mountViews();
        const group = w.find('ul[role="group"]');
        expect(group.attributes('style') ?? '').not.toContain('display: none');
        await w.find('button.group').trigger('click');
        expect(group.attributes('style')).toContain('display: none');
        expect(w.find('button.group').attributes('aria-expanded')).toBe('false');
    });

    it('selects on click without opening', async () => {
        const w = mountViews();
        await rows(w)[1].trigger('click');
        expect(rows(w)[1].classes()).toContain('selected');
        expect(window.open).not.toHaveBeenCalled();
    });

    it('opens the saved view in a new tab on double click and on Enter', async () => {
        const w = mountViews();
        await rows(w)[1].trigger('dblclick');
        expect(window.open).toHaveBeenLastCalledWith('/r/org/ds/views/v_bbbbbbbb', '_blank', 'noopener');
        await rows(w)[0].trigger('keydown', { key: 'Enter' });
        expect(window.open).toHaveBeenLastCalledWith('/r/org/ds/views/v_aaaaaaaa', '_blank', 'noopener');
    });

    it('opens the view the menu was opened on', async () => {
        const w = mountViews();
        await rows(w)[0].trigger('contextmenu');
        item(w, 'Open').click();
        expect(window.open).toHaveBeenCalledWith('/r/org/ds/views/v_aaaaaaaa', '_blank', 'noopener');
    });

    it('copies the absolute link and says so, naming the view as text', async () => {
        const w = mountViews();
        await rows(w)[1].trigger('contextmenu');
        await item(w, 'Copy Link').click();
        expect(m.copyText).toHaveBeenCalledWith(`${window.location.origin}/r/org/ds/views/v_bbbbbbbb`);
        expect(m.success).toHaveBeenCalledWith('Link copied to the clipboard', { summary: 'Beta' });
    });

    it('says when the link could not be copied', async () => {
        m.copyText.mockRejectedValueOnce(new Error('denied'));
        const w = mountViews();
        await rows(w)[1].trigger('contextmenu');
        await item(w, 'Copy Link').click();
        expect(m.error).toHaveBeenCalledWith('The link could not be copied', { summary: 'Beta' });
    });

    it('offers only Open and Copy Link to a reader', async () => {
        const w = mountViews({ canWrite: false });
        await rows(w)[0].trigger('contextmenu');
        expect(visibleLabels(w)).toEqual(['Open', 'Copy Link']);
    });

    it('offers nothing before a view is chosen', () => {
        expect(visibleLabels(mountViews({ canWrite: true }))).toEqual([]);
    });

    it('lets a writer rename and delete, asking the page to do it', async () => {
        const w = mountViews({ canWrite: true });
        await rows(w)[1].trigger('contextmenu');
        expect(visibleLabels(w)).toEqual(['Open', 'Copy Link', 'Rename', 'Delete']);
        item(w, 'Rename').click();
        item(w, 'Delete').click();
        expect(w.emitted('rename')[0][0]).toEqual(views[1]);
        expect(w.emitted('delete')[0][0]).toEqual(views[1]);
    });
});
