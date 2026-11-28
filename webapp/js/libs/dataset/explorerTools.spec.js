/**
 * The explorer toolbar: a fixed list of actions of the registry. The buttons keep their places
 * whatever is selected (an action that does not apply is disabled, with its reason); a reader has
 * no write actions; the Open slot is labelled by the viewer table.
 */
import { describe, it, expect, vi } from 'vitest';
import ddb from 'ddb';
import { explorerTools, locationTools } from './explorerTools';

const T = ddb.entry.type;
const file = (type, path = 'x') => ({ path: `ddb://h/o/d/${path}`, entry: { type, path } });
const ids = tools => tools.map(t => t.id);
const byId = (tools, id) => tools.find(t => t.id === id);

function context({ canWrite = true, files = [], selected = [], viewMode = 'grid', expandedGrid = false, tileSize = 's' } = {}) {
    return {
        getSelectedEntries: () => selected, getFiles: () => files, canWrite, viewMode, expandedGrid, tileSize,
        selectAll: vi.fn(), emit: vi.fn(), clipboardEmpty: () => true
    };
}

// The options of a view come before the view switch, so Grid | List stay at the end
const VIEW_END = ['view-grid', 'view-list'];
const GRID_OPTIONS = ['tile-size-s', 'tile-size-m', 'tile-size-l'];
const LIST_OPTIONS = ['thumbnails'];
const WRITER_START = ['upload', 'new-folder', 'separator', 'open', 'share-embed', 'rename', 'delete', 'separator',
    'select-all', 'clear-selection', 'spacer'];
const WRITER_IDS = {
    grid: [...WRITER_START, ...GRID_OPTIONS, ...VIEW_END],
    table: [...WRITER_START, ...LIST_OPTIONS, ...VIEW_END]
};

describe('explorerTools', () => {
    const a = file(T.GENERIC, 'a.bin'), b = file(T.GEOIMAGE, 'b.jpg'), c = file(T.IMAGE, 'c.png');
    const files = [a, b, c];

    it('shows the same ids in the same order for 0, 1 and n selected files', () => {
        for (const selected of [[], [a], [a, b], files]) {
            for (const viewMode of ['grid', 'table']) {
                expect(ids(explorerTools(context({ files, selected, viewMode })))).toEqual(WRITER_IDS[viewMode]);
            }
        }
    });

    it('disables what does not apply, with its reason, instead of hiding it', () => {
        const none = explorerTools(context({ files, selected: [] }));
        for (const id of ['open', 'share-embed', 'rename', 'delete', 'clear-selection']) {
            expect(byId(none, id).disabled).toBe(true);
            expect(byId(none, id).disabledReason).not.toBe('');
        }
        expect(byId(none, 'select-all').disabled).toBe(false);

        const several = explorerTools(context({ files, selected: [a, b] }));
        expect(byId(several, 'rename')).toMatchObject({ disabled: true, disabledReason: 'Select one file to rename' });
        expect(byId(several, 'delete').disabled).toBe(false);
        expect(byId(several, 'open').disabled).toBe(false);

        const all = explorerTools(context({ files, selected: files }));
        expect(byId(all, 'select-all')).toMatchObject({ disabled: true, disabledReason: 'Every file is selected' });
    });

    it('offers a reader browsing, Open and Share/Embed, and no write action', () => {
        const tools = explorerTools(context({ canWrite: false, files, selected: [a] }));
        // HubToolbar drops the separator left at the start
        expect(ids(tools)).toEqual(['separator', 'open', 'share-embed', 'separator', 'select-all', 'clear-selection', 'spacer',
            ...GRID_OPTIONS, ...VIEW_END]);
        expect(byId(tools, 'share-embed').disabled).toBe(false);
    });

    it('labels the Open slot from the viewer table and opens the file in its default viewer', () => {
        const pc = file(T.POINTCLOUD, 'cloud.laz');
        const ctx = context({ files: [pc], selected: [pc] });
        const open = byId(explorerTools(ctx), 'open');
        expect(open).toMatchObject({ title: 'Open Point Cloud', icon: 'fa-solid fa-cube' });
        open.onClick();
        expect(ctx.emit).toHaveBeenCalledWith('openItem', pc);

        expect(byId(explorerTools(context({ selected: [file(T.GEORASTER)] })), 'open').title).toBe('Open Map');
        expect(byId(explorerTools(context({ selected: [file(T.TILES3D, 't.3tz')] })), 'open').title).toBe('Open 3D Tiles');
        expect(byId(explorerTools(context({ selected: [a, b] })), 'open').title).toBe('Open');
    });

    it('runs the actions through the page handlers, and not when disabled', () => {
        const ctx = context({ files, selected: [a] });
        const tools = explorerTools(ctx);
        byId(tools, 'rename').onClick();
        byId(tools, 'delete').onClick();
        byId(tools, 'share-embed').onClick();
        byId(tools, 'new-folder').onClick();
        byId(tools, 'upload').onClick();
        byId(tools, 'view-list').onClick();
        byId(tools, 'select-all').onClick();
        byId(tools, 'clear-selection').onClick();
        expect(ctx.emit.mock.calls).toEqual([['moveSelectedItems'], ['deleteSelecteditems'], ['shareEmbed', a],
            ['createFolder'], ['upload'], ['setViewMode', 'table']]);
        expect(ctx.selectAll.mock.calls).toEqual([[true], [false]]);

        const idle = context({ files, selected: [] });
        byId(explorerTools(idle), 'delete').onClick();
        expect(idle.emit).not.toHaveBeenCalled();

        const list = context({ files, selected: [], viewMode: 'table' });
        byId(explorerTools(list), 'thumbnails').onClick();
        expect(list.emit.mock.calls).toEqual([['toggleExpandedGrid']]);
    });

    it('gives the view tools a pressed state: a segmented Grid | List, and Thumbnails in the list view', () => {
        const grid = explorerTools(context({ viewMode: 'grid', expandedGrid: true }));
        expect([byId(grid, 'view-grid').pressed, byId(grid, 'view-list').pressed]).toEqual([true, false]);
        for (const expandedGrid of [true, false]) {
            const table = explorerTools(context({ viewMode: 'table', expandedGrid }));
            expect([byId(table, 'view-grid').pressed, byId(table, 'view-list').pressed, byId(table, 'thumbnails').pressed])
                .toEqual([false, true, expandedGrid]);
            expect(byId(table, 'thumbnails').disabled).toBe(false);
        }
    });

    it('offers the thumbnail size S | M | L in the grid view, the size in force pressed', () => {
        for (const tileSize of ['s', 'm', 'l']) {
            const tools = explorerTools(context({ viewMode: 'grid', tileSize }));
            const sizes = ['tile-size-s', 'tile-size-m', 'tile-size-l'].map(id => byId(tools, id));
            expect(sizes.map(t => t.pressed)).toEqual(['s', 'm', 'l'].map(k => k === tileSize));
            expect(sizes.map(t => t.disabled)).toEqual([false, false, false]);
            expect(sizes.map(t => t.text)).toEqual(['S', 'M', 'L']);
            expect(sizes.map(t => t.title)).toEqual(['Small thumbnails', 'Medium thumbnails', 'Large thumbnails']);
        }
    });

    it('shows the thumbnail size in the grid view only, and Thumbnails in the list view only', () => {
        const grid = ids(explorerTools(context({ viewMode: 'grid', tileSize: 'm' })));
        const list = ids(explorerTools(context({ viewMode: 'table', tileSize: 'm' })));
        for (const id of GRID_OPTIONS) {
            expect(grid).toContain(id);
            expect(list).not.toContain(id);
        }
        for (const id of LIST_OPTIONS) {
            expect(list).toContain(id);
            expect(grid).not.toContain(id);
        }
    });

    it('keeps Refresh and Grid | List at the end of the toolbar in both views, so the switch does not move', () => {
        for (const viewMode of ['grid', 'table']) {
            for (const canWrite of [true, false]) {
                expect(ids(explorerTools(context({ viewMode, canWrite }))).slice(-VIEW_END.length)).toEqual(VIEW_END);
            }
        }
    });

    it('sets the size through the page handler, and only on the wide screens (priority 3)', () => {
        const ctx = context({ viewMode: 'grid', tileSize: 's' });
        const tools = explorerTools(ctx);
        byId(tools, 'tile-size-l').onClick();
        byId(tools, 'tile-size-m').onClick();
        expect(ctx.emit.mock.calls).toEqual([['setTileSize', 'l'], ['setTileSize', 'm']]);
        expect(['tile-size-s', 'tile-size-m', 'tile-size-l'].map(id => byId(tools, id).priority)).toEqual([3, 3, 3]);

    });

    it('keeps Upload, New folder and the view toggle on a phone, and labels Upload and New folder', () => {
        const tools = explorerTools(context({ files, selected: [a] }));
        const phone = tools.filter(t => t.priority === 1).map(t => t.id);
        expect(phone).toEqual(['upload', 'new-folder', 'view-grid', 'view-list']);
        expect(tools.filter(t => t.showLabel).map(t => t.id)).toEqual(['upload', 'new-folder', 'view-grid', 'view-list']);
    });
});

describe('locationTools', () => {
    it('holds Refresh, the action on the folder shown, which the toolbar does not', () => {
        for (const canWrite of [true, false]) {
            for (const viewMode of ['grid', 'table']) {
                const ctx = context({ canWrite, viewMode });
                expect(ids(locationTools(ctx))).toEqual(['refresh']);
                expect(ids(explorerTools(ctx))).not.toContain('refresh');
            }
        }
    });

    it('refreshes through the page handler, whatever is selected', () => {
        const ctx = context({ selected: [file(T.GENERIC)] });
        const [refresh] = locationTools(ctx);
        expect(refresh).toMatchObject({ title: 'Refresh', icon: 'fa-solid fa-rotate-right', disabled: false });
        refresh.onClick();
        expect(ctx.emit.mock.calls).toEqual([['refresh']]);
    });
});
