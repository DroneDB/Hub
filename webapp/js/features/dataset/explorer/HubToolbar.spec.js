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

    it('shows the toggle state the tools give, and follows it when it changes', async () => {
        const onClick = vi.fn();
        const grid = selected => [{ id: 'spacer' }, { id: 'expanded-grid', title: 'Expanded Table View', icon: 'fa-solid fa-table-cells-large', selected, onClick }];
        const w = mountToolbar(grid(true));
        expect(button(w, 'Expanded Table View').classes()).toContain('p-button-contrast');

        await button(w, 'Expanded Table View').trigger('click');
        expect(onClick).toHaveBeenCalledTimes(1);
        // The toolbar keeps no state of its own: the toggle stays as the tools say until they change
        expect(button(w, 'Expanded Table View').classes()).toContain('p-button-contrast');

        await w.setProps({ tools: grid(false) });
        expect(button(w, 'Expanded Table View').classes()).not.toContain('p-button-contrast');
        expect(button(w, 'Expanded Table View').classes()).toContain('p-button-secondary');
    });

    it('does not run a disabled tool', async () => {
        const onClick = vi.fn();
        const w = mountToolbar([{ id: 'remove', title: 'Remove', icon: 'fa-solid fa-trash', disabled: true, onClick }]);
        expect(button(w, 'Remove').attributes('disabled')).toBeDefined();
        w.vm.runTool(w.props('tools')[0]);
        expect(onClick).not.toHaveBeenCalled();
    });
});
