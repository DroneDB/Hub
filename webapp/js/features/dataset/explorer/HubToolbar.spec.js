/**
 * The explorer toolbar renders the tools it is given and runs their onClick of the moment: the
 * parent rebuilds the tools when the selection changes, with closures over the new selection,
 * whose JSON is the same as before (Rename of README.md, then of newdir).
 */
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import HubToolbar from './HubToolbar.vue';

const mountToolbar = tools => mount(HubToolbar, { props: { tools }, global: { plugins: [PrimeVue] } });
const button = (w, title) => w.find(`button[title="${title}"]`);

function selectionTools(act, item) {
    return [
        { id: 'rename', title: 'Rename', icon: 'fa-solid fa-pen-to-square', onClick: () => act.rename(item) },
        { id: 'separator' },
        { id: 'share-embed', title: 'Share/Embed', icon: 'fa-solid fa-share-nodes', onClick: () => act.share(item) },
        { id: 'open', title: 'Open', icon: 'fa-solid fa-folder-open', onClick: () => act.open(item) },
        { id: 'spacer' },
        { id: 'refresh', title: 'Refresh', icon: 'fa-solid fa-rotate-right', onClick: act.refresh }
    ];
}

describe('HubToolbar', () => {
    it('runs the onClick of the tools last passed in, even when their JSON did not change', async () => {
        const act = { rename: vi.fn(), share: vi.fn(), open: vi.fn(), refresh: vi.fn() };
        const readme = { label: 'README.md' };
        const newdir = { label: 'newdir' };
        const w = mountToolbar(selectionTools(act, readme));

        const next = selectionTools(act, newdir);
        expect(JSON.stringify(next)).toBe(JSON.stringify(selectionTools(act, readme)));
        await w.setProps({ tools: next });

        await button(w, 'Rename').trigger('click');
        await button(w, 'Share/Embed').trigger('click');
        await button(w, 'Open').trigger('click');
        expect(act.rename).toHaveBeenCalledExactlyOnceWith(newdir);
        expect(act.share).toHaveBeenCalledExactlyOnceWith(newdir);
        expect(act.open).toHaveBeenCalledExactlyOnceWith(newdir);
    });

    it('splits the tools at the spacer and draws the separators', () => {
        const act = { rename: vi.fn(), share: vi.fn(), open: vi.fn(), refresh: vi.fn() };
        const w = mountToolbar(selectionTools(act, {}));
        expect(w.find('.p-toolbar-start').findAll('button').map(b => b.attributes('title'))).toEqual(['Rename', 'Share/Embed', 'Open']);
        expect(w.find('.p-toolbar-end').findAll('button').map(b => b.attributes('title'))).toEqual(['Refresh']);
        expect(w.findAll('.p-divider')).toHaveLength(1);
    });

    it('shows the pressed state the tools give, and follows it when it changes', async () => {
        const onClick = vi.fn();
        const grid = pressed => [{ id: 'spacer' }, { id: 'thumbnails', title: 'Thumbnails', icon: 'fa-regular fa-image', pressed, onClick }];
        const w = mountToolbar(grid(true));
        expect(button(w, 'Thumbnails').classes()).toContain('p-button-contrast');
        expect(button(w, 'Thumbnails').attributes('aria-pressed')).toBe('true');

        await button(w, 'Thumbnails').trigger('click');
        expect(onClick).toHaveBeenCalledTimes(1);
        // The toolbar keeps no state of its own: the toggle stays as the tools say until they change
        expect(button(w, 'Thumbnails').classes()).toContain('p-button-contrast');

        await w.setProps({ tools: grid(false) });
        expect(button(w, 'Thumbnails').classes()).not.toContain('p-button-contrast');
        expect(button(w, 'Thumbnails').attributes('aria-pressed')).toBe('false');
    });

    it('keeps a disabled tool focusable and gives its reason, and does not run it', async () => {
        const onClick = vi.fn();
        const w = mountToolbar([{ id: 'delete', title: 'Delete', icon: 'fa-solid fa-trash', disabled: true, disabledReason: 'Select the files to delete', onClick }]);
        const b = w.find('button[aria-label="Delete"]');
        expect(b.attributes('disabled')).toBeUndefined();
        expect(b.attributes('aria-disabled')).toBe('true');
        expect(b.attributes('title')).toBe('Delete: Select the files to delete');
        const reason = w.find(`#${b.attributes('aria-describedby')}`);
        expect(reason.text()).toBe('Select the files to delete');
        await b.trigger('click');
        expect(onClick).not.toHaveBeenCalled();
    });

    describe('overflow by priority', () => {
        const tools = act => [
            { id: 'upload', title: 'Upload', icon: 'fa-solid fa-upload', priority: 1, showLabel: true, onClick: act.upload },
            { id: 'separator' },
            { id: 'open', title: 'Open', icon: 'fa-regular fa-folder-open', priority: 2, onClick: act.open },
            { id: 'select-all', title: 'Select all', icon: 'fa-regular fa-square-check', priority: 3, onClick: act.selectAll },
            { id: 'spacer' },
            { id: 'refresh', title: 'Refresh', icon: 'fa-solid fa-rotate-right', priority: 2, onClick: act.refresh },
            { id: 'view-grid', title: 'Grid', icon: 'fa-solid fa-table-cells-large', priority: 1, pressed: true, onClick: act.grid }
        ];
        const shown = w => w.findAll('button[data-tool]').map(b => b.attributes('data-tool'));
        const act = () => ({ upload: vi.fn(), open: vi.fn(), selectAll: vi.fn(), refresh: vi.fn(), grid: vi.fn() });

        it('shows every tool, with the labels, on a wide toolbar (or before it is measured)', async () => {
            const w = mountToolbar(tools(act()));
            expect(shown(w)).toEqual(['upload', 'open', 'select-all', 'refresh', 'view-grid']);
            await w.setData({ width: 1200 });
            expect(shown(w)).toEqual(['upload', 'open', 'select-all', 'refresh', 'view-grid']);
            expect(w.find('[data-tool="upload"]').text()).toBe('Upload');
            expect(w.findAll('.p-divider')).toHaveLength(1);
        });

        it('moves the tools of priority 3 into More on a tablet, and drops the labels', async () => {
            const w = mountToolbar(tools(act()));
            await w.setData({ width: 800 });
            expect(shown(w)).toEqual(['upload', 'open', 'refresh', 'view-grid', 'more']);
            expect(w.vm.overflowModel.map(i => i.label)).toEqual(['Select all']);
            expect(w.find('[data-tool="upload"]').text()).toBe('');
        });

        it('keeps the tools of priority 1 on a phone; the others run from More', async () => {
            const a = act();
            const w = mountToolbar(tools(a));
            await w.setData({ width: 390 });
            expect(shown(w)).toEqual(['upload', 'view-grid', 'more']);
            expect(w.findAll('.p-divider')).toHaveLength(0);
            const more = w.vm.overflowModel;
            expect(more.map(i => i.label)).toEqual(['Open', 'Select all', 'Refresh']);
            more.find(i => i.label === 'Refresh').command();
            expect(a.refresh).toHaveBeenCalledTimes(1);
            expect(w.find('[data-tool="more"]').attributes('aria-haspopup')).toBe('true');
        });
    });
});
