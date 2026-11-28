import { describe, it, expect, vi } from 'vitest';
import ddb from 'ddb';
import {
    TRAINING_DEFAULTS, TRAINING_LIMITS, isTrainingExportFolder, trainingExportPath, defaultTrainingFileName,
    validateTrainingOptions, trainingWarnings, odmProjectEvidence, looksLikeOdmProject
} from './trainingExport';
import { splatTrainingExportItem, buildStandardContextMenu, buildActionMenuItems } from '@/libs/contextMenuItems';
import { taskToolOffered } from '@/libs/tasks/taskTools';

vi.mock('@/libs/tasks/taskTools', () => ({ taskToolOffered: vi.fn(() => true) }));

const T = ddb.entry.type;
const folder = path => ({ path, type: T.DIRECTORY });
const file = path => ({ path, type: T.GENERIC });
// The root of the folder tree as the server lists it: the dataset, named by its address
const treeRoot = { path: 'ddb+unsafe://localhost:5180/odm/langley', type: T.DRONEDB };

describe('the options of the training-data export', () => {
    const valid = { maxImageSize: TRAINING_DEFAULTS.maxImageSize, maxPoints: TRAINING_DEFAULTS.maxPoints, fileName: 'project-training-data.zip' };

    it('starts from 1600 pixels and 100000 points', () => {
        expect(TRAINING_DEFAULTS).toEqual({ maxImageSize: 1600, maxPoints: 100000 });
    });

    it('turns valid options into the params of the task', () => {
        expect(validateTrainingOptions(valid)).toEqual({ errors: {}, params: { maxImageSize: 1600, maxPoints: 100000, fileName: 'project-training-data.zip' } });
    });

    it('leaves the file name out when it is empty, so the server chooses one', () => {
        expect(validateTrainingOptions({ ...valid, fileName: '  ' }).params).toEqual({ maxImageSize: 1600, maxPoints: 100000 });
        expect(validateTrainingOptions({ ...valid, fileName: null }).params).toEqual({ maxImageSize: 1600, maxPoints: 100000 });
    });

    it('accepts the ends of the ranges, 0 for the originals and for no points included', () => {
        expect(validateTrainingOptions({ ...valid, maxImageSize: 0, maxPoints: 0 }).params).toMatchObject({ maxImageSize: 0, maxPoints: 0 });
        const top = validateTrainingOptions({ ...valid, maxImageSize: TRAINING_LIMITS.maxImageSize, maxPoints: TRAINING_LIMITS.maxPoints });
        expect(top.errors).toEqual({});
    });

    it.each([-1, 1.5, TRAINING_LIMITS.maxImageSize + 1, null, undefined, NaN, '1600'])('refuses %s as the image size', value => {
        const { errors, params } = validateTrainingOptions({ ...valid, maxImageSize: value });
        expect(errors.maxImageSize).toBeTruthy();
        expect(errors.maxPoints).toBeUndefined();
        expect(params).toBeNull();
    });

    it.each([-5, 0.5, TRAINING_LIMITS.maxPoints + 1, null, undefined])('refuses %s as the number of points', value => {
        const { errors, params } = validateTrainingOptions({ ...valid, maxPoints: value });
        expect(errors.maxPoints).toBeTruthy();
        expect(params).toBeNull();
    });

    it.each(['a/b.zip', 'a\\b.zip', '..', '.', 'x'.repeat(TRAINING_LIMITS.fileName + 1)])('refuses the file name %s', name => {
        const { errors, params } = validateTrainingOptions({ ...valid, fileName: name });
        expect(errors.fileName).toBeTruthy();
        expect(params).toBeNull();
    });

    it('reports every wrong field at once', () => {
        const { errors } = validateTrainingOptions({ maxImageSize: -1, maxPoints: -1, fileName: 'a/b' });
        expect(Object.keys(errors).sort()).toEqual(['fileName', 'maxImageSize', 'maxPoints']);
    });
});

describe('the folder of the export', () => {
    it('is a folder or the root of the dataset', () => {
        expect(isTrainingExportFolder(folder('odm/project'))).toBe(true);
        expect(isTrainingExportFolder({ path: '', type: T.DRONEDB })).toBe(true);
        expect(isTrainingExportFolder({ path: 'nested', type: T.DRONEDB })).toBe(false);
        expect(isTrainingExportFolder(file('cameras.json'))).toBe(false);
        expect(isTrainingExportFolder(null)).toBe(false);
    });

    it('is submitted as its path, or as nothing for the root', () => {
        expect(trainingExportPath(folder('odm/project'))).toBe('odm/project');
        expect(trainingExportPath({ path: '', type: T.DRONEDB })).toBeNull();
        expect(trainingExportPath(treeRoot)).toBeNull();
    });

    it('is the root of the folder tree, which the server names by the address of the dataset', () => {
        expect(isTrainingExportFolder(treeRoot)).toBe(true);
        expect(isTrainingExportFolder({ path: 'ddb://hub.dronedb.app/org/ds', type: T.DRONEDB })).toBe(true);
    });

    it('gives the file the name of the folder, as the server does', () => {
        expect(defaultTrainingFileName('odm/project')).toBe('project-training-data.zip');
        expect(defaultTrainingFileName(null)).toBe('dataset-training-data.zip');
    });
});

describe('the warnings in the log of the task', () => {
    it('reads the lines that start with Warning:, without the time the log adds', () => {
        const lines = [
            'Exporting the training data of \'odm\'',
            'Phase: points',
            '[14:22:01] Warning: 12 of 40 images are left out (no pose)',
            'Warning: most of the flight looks straight down',
            '  Warning:   padded line  ',
            '40 image(s), 1000 point(s): archiving'
        ];
        expect(trainingWarnings(lines)).toEqual([
            '12 of 40 images are left out (no pose)', 'most of the flight looks straight down', 'padded line'
        ]);
    });

    it('lists a warning once and ignores lines that only mention one', () => {
        expect(trainingWarnings(['Warning: a', 'Warning: a', 'Note: Warning: b', 'Warning:', 7, null])).toEqual(['a']);
    });

    it('gives nothing for no log', () => {
        expect(trainingWarnings(undefined)).toEqual([]);
        expect(trainingWarnings([])).toEqual([]);
    });
});

describe('detecting an ODM project', () => {
    it('is one at once when the folder has cameras.json', () => {
        expect(odmProjectEvidence([file('p/cameras.json'), folder('p/images')])).toBe('yes');
    });

    it('may be one when it has odm_georeferencing, which coords.txt settles', () => {
        expect(odmProjectEvidence([folder('p/odm_georeferencing'), folder('p/images')])).toBe('maybe');
    });

    it('is not one otherwise, and a file or folder of the same name does not count', () => {
        expect(odmProjectEvidence([file('p/a.tif'), folder('p/cameras.json'), file('p/odm_georeferencing')])).toBe('no');
        expect(odmProjectEvidence([])).toBe('no');
        expect(odmProjectEvidence(undefined)).toBe('no');
    });

    it('reads one folder when cameras.json is there', async () => {
        const dataset = { list: vi.fn(async () => [file('p/cameras.json')]) };
        expect(await looksLikeOdmProject(dataset, 'p')).toBe(true);
        expect(dataset.list).toHaveBeenCalledOnce();
        expect(dataset.list).toHaveBeenCalledWith('p');
    });

    it('reads odm_georeferencing for coords.txt when there is no cameras.json', async () => {
        const dataset = { list: vi.fn(async path => (path === 'p' ? [folder('p/odm_georeferencing')] : [file('p/odm_georeferencing/coords.txt')])) };
        expect(await looksLikeOdmProject(dataset, 'p')).toBe(true);
        expect(dataset.list).toHaveBeenLastCalledWith('p/odm_georeferencing');
        const without = { list: vi.fn(async path => (path === 'p' ? [folder('p/odm_georeferencing')] : [file('p/odm_georeferencing/other.txt')])) };
        expect(await looksLikeOdmProject(without, 'p')).toBe(false);
    });

    it('reads the root of the dataset without a path', async () => {
        const dataset = { list: vi.fn(async () => [file('cameras.json')]) };
        expect(await looksLikeOdmProject(dataset, null)).toBe(true);
        expect(dataset.list).toHaveBeenCalledWith(undefined);
    });

    it('says no for a folder with neither, and does not hold a failed read against the folder', async () => {
        expect(await looksLikeOdmProject({ list: async () => [file('p/a.tif')] }, 'p')).toBe(false);
        expect(await looksLikeOdmProject({ list: async () => { throw new Error('offline'); } }, 'p')).toBe(true);
    });
});

describe('the context menu item', () => {
    const context = (files, emit = vi.fn()) => ({ getSelectedEntries: () => files, canWrite: false, dataset: null, emit });
    const item = ctx => splatTrainingExportItem(ctx);

    it('is shown for a single folder, the root included, when the server has the task', () => {
        expect(item(context([{ entry: folder('p') }])).isVisible()).toBe(true);
        expect(item(context([{ entry: { path: '', type: T.DRONEDB } }])).isVisible()).toBe(true);
    });

    it('is not shown for a file, a selection of several, none, or a server without the task', () => {
        expect(item(context([{ entry: file('a.ply') }])).isVisible()).toBe(false);
        expect(item(context([{ entry: folder('p') }, { entry: folder('q') }])).isVisible()).toBe(false);
        expect(item(context([])).isVisible()).toBe(false);
        taskToolOffered.mockReturnValue(false);
        try {
            expect(item(context([{ entry: folder('p') }])).isVisible()).toBe(false);
        } finally {
            taskToolOffered.mockReturnValue(true);
        }
    });

    it('asks the page for the dialog with the folder, and needs no write access', () => {
        const emit = vi.fn();
        const selected = { entry: folder('p') };
        item(context([selected], emit)).click();
        expect(emit).toHaveBeenCalledWith('exportSplatTrainingData', selected);
    });

    it('is under Tools of the root of the folder tree', () => {
        const tools = buildActionMenuItems(context([{ entry: treeRoot }])).find(i => i.label === 'Tools');
        expect(tools.items.filter(i => i.type !== 'separator' && i.isVisible()).map(i => i.label)).toEqual(['Export splat training data']);
    });

    it('is part of the standard menu, under Tools', () => {
        const tools = buildStandardContextMenu(context([{ entry: folder('p') }])).find(i => i.label === 'Tools');
        expect(tools.items.filter(i => i.isVisible()).map(i => i.label)).toContain('Export splat training data');
    });
});
