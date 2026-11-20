import { describe, it, expect } from 'vitest';
import { entry as ddbEntry } from 'ddb';
import { tileTitle } from './tileTitle';

const T = ddbEntry.type;

describe('tileTitle (FR-EXP-21)', () => {
    it('is the relative path, the type and the size', () => {
        expect(tileTitle({ path: 'images/a.jpg', type: T.IMAGE, size: 3355443 })).toBe('images/a.jpg — Image — 3.2 MB');
    });

    it('has no size for a folder, and no build state for a file libddb does not build', () => {
        expect(tileTitle({ path: 'images', type: T.DIRECTORY })).toBe('images — Folder');
        expect(tileTitle({ path: 'a.jpg', type: T.IMAGE, size: 10, buildStatus: 'failed' })).toBe('a.jpg — Image — 10 B');
    });

    it('adds the build word of a buildable file', () => {
        expect(tileTitle({ path: 'c.laz', type: T.POINTCLOUD, size: 1024, buildStatus: 'queued' })).toBe('c.laz — Point Cloud — 1 KB — Queued');
        expect(tileTitle({ path: 'c.laz', type: T.POINTCLOUD, size: 1024 }, { currentState: 'Processing' })).toBe('c.laz — Point Cloud — 1 KB — Building…');
    });
});
