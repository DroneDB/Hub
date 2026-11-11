/**
 * pendingBuild: a deferred build that waits for files names them and tells the user to upload
 * them (no timer retries it); one on hold for another reason says it is retried automatically.
 */
import { describe, it, expect } from 'vitest';
import { describePendingBuild, describeEntryPendingBuild } from './pendingBuild';

describe('describePendingBuild', () => {
    it('names the missing files and says that uploading them starts the build', () => {
        const p = describePendingBuild(['model.mtl', 'textures/wall.png'], true);
        expect(p.awaitingFiles).toBe(true);
        expect(p.files).toEqual(['model.mtl', 'textures/wall.png']);
        expect(p.label).toBe('Waiting for files');
        expect(p.title).toBe('Waiting for Files');
        expect(p.text).toBe('Waiting for files: model.mtl, textures/wall.png. Upload the missing files to this dataset and processing starts by itself.');
        expect(p.text).not.toMatch(/retr/i);
    });

    it('speaks of one file when one is missing', () => {
        expect(describePendingBuild(['roads.shx'], true).text)
            .toBe('Waiting for files: roads.shx. Upload the missing file to this dataset and processing starts by itself.');
    });

    it('says a build on hold without missing files will be retried, naming no file', () => {
        for (const missing of [[], null, undefined]) {
            const p = describePendingBuild(missing, false);
            expect(p).toMatchObject({ awaitingFiles: false, files: [], label: 'On Hold', title: 'Processing On Hold' });
            expect(p.text).toBe('Processing is on hold and will be retried automatically.');
        }
    });

    it('follows the awaitingFiles the server reports, not the names', () => {
        // libddb decides whether a build waits for files: names alone never make it wait
        expect(describePendingBuild(['model.mtl'], false)).toMatchObject({ awaitingFiles: false, label: 'On Hold' });
        expect(describePendingBuild(['model.mtl'])).toMatchObject({ awaitingFiles: false, label: 'On Hold' });
        const waiting = describePendingBuild([], true);
        expect(waiting).toMatchObject({ awaitingFiles: true, label: 'Waiting for files' });
        expect(waiting.text).toBe('Waiting for files. Upload the missing files to this dataset and processing starts by itself.');
    });
});

describe('describeEntryPendingBuild', () => {
    it('reads buildAwaitingFiles and the missing names of the entry', () => {
        expect(describeEntryPendingBuild({ buildStatus: 'pending', buildMissingDependencies: ['a.mtl'], buildAwaitingFiles: true }).text)
            .toContain('Waiting for files: a.mtl.');
        expect(describeEntryPendingBuild({ buildStatus: 'pending', buildMissingDependencies: ['a.mtl'], buildAwaitingFiles: false }))
            .toMatchObject({ awaitingFiles: false, label: 'On Hold', files: ['a.mtl'] });
        expect(describeEntryPendingBuild({ buildStatus: 'pending', buildMissingDependencies: ['a.mtl'] }).awaitingFiles)
            .toBe(false);
        expect(describeEntryPendingBuild({ buildStatus: 'pending', buildAwaitingFiles: false }).awaitingFiles).toBe(false);
        expect(describeEntryPendingBuild(null).awaitingFiles).toBe(false);
    });
});
