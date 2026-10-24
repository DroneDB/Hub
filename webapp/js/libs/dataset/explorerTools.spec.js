import { describe, it, expect, vi } from 'vitest';
import ddb from 'ddb';
import { explorerTools } from './explorerTools';

const T = ddb.entry.type;
const file = type => ({ entry: { type, path: 'x' } });
const ids = tools => tools.map(t => t.id);
const actions = () => Object.fromEntries(['upload', 'newFolder', 'selectAll', 'rename', 'remove', 'share', 'open', 'refresh', 'toggleExpandedGrid', 'toggleViewMode'].map(k => [k, vi.fn()]));

describe('explorerTools', () => {
    it('offers only browsing to a reader', () => {
        const files = [file(T.GENERIC)];
        expect(ids(explorerTools({ canWrite: false, files, selected: [], viewMode: 'grid', expandedGrid: false }, actions())))
            .toEqual(['select-all', 'spacer', 'refresh', 'view-toggle']);
    });

    it('opens one point cloud in the map and the point-cloud viewer', () => {
        const pc = file(T.POINTCLOUD);
        const act = actions();
        const tools = explorerTools({ canWrite: true, files: [pc], selected: [pc], viewMode: 'table', expandedGrid: true }, act);
        expect(ids(tools)).toEqual(['upload', 'newfolder', 'deselect-all', 'rename', 'remove', 'separator', 'share-embed',
            'open-map', 'open-pointcloud', 'spacer', 'refresh', 'expanded-grid', 'view-toggle']);
        tools.find(t => t.id === 'open-pointcloud').onClick();
        expect(act.open).toHaveBeenCalledWith(pc, 'pointcloud');
        expect(tools.find(t => t.id === 'expanded-grid').selected).toBe(true);
        expect(tools.find(t => t.id === 'view-toggle').title).toBe('Grid View');
    });

    it('falls back to Open for several files or other types', () => {
        const a = file(T.GENERIC), b = file(T.GEOIMAGE);
        const tools = explorerTools({ canWrite: true, files: [a, b], selected: [a, b], viewMode: 'grid', expandedGrid: false }, actions());
        expect(ids(tools)).toContain('open');
        expect(ids(tools)).not.toContain('rename');
        expect(ids(tools)).not.toContain('select-all');
    });
});
