/** The form of the upload page: the organizations, the default name, the refusal of a field (FR-UPL-02, D-047). */
import { describe, it, expect } from 'vitest';
import {
    DATASET_NAME_MAX_LENGTH, writableOrganizations, defaultOrganization, defaultDatasetName, fieldErrorOf
} from './uploadForm';

const orgs = [
    { slug: 'alice', name: 'alice', permissions: { canWrite: true } },
    { slug: 'survey-team', name: 'Survey Team', permissions: { canWrite: false } },
    { slug: 'drone-lab', name: 'Drone Lab', permissions: { canWrite: true } },
    { slug: 'no-permissions', name: 'None' }
];

describe('writableOrganizations', () => {
    it('keeps only the organizations the user may write: the list also holds Public ones that can only be read', () => {
        expect(writableOrganizations(orgs).map(o => o.slug)).toEqual(['alice', 'drone-lab']);
    });

    it('is empty without a list', () => {
        expect(writableOrganizations(undefined)).toEqual([]);
    });
});

describe('defaultOrganization', () => {
    it('is the personal organization: the one that has the name of the user', () => {
        expect(defaultOrganization(writableOrganizations(orgs), 'alice')?.slug).toBe('alice');
        expect(defaultOrganization([{ slug: 'x', name: 'x' }, { slug: 'alice-2', name: 'Alice' }], 'alice')?.slug).toBe('alice-2');
    });

    it('is the first writable organization when none is personal, and null when there is none', () => {
        expect(defaultOrganization(writableOrganizations(orgs), 'bob')?.slug).toBe('alice');
        expect(defaultOrganization([], 'bob')).toBeNull();
    });
});

describe('defaultDatasetName', () => {
    it('is the file name without its extension', () => {
        expect(defaultDatasetName([{ name: 'DJI_0025.JPG' }, { name: 'b.jpg' }])).toBe('DJI_0025');
        expect(defaultDatasetName([{ name: 'archive.tar.gz' }])).toBe('archive.tar');
        expect(defaultDatasetName([{ name: 'README' }])).toBe('README');
    });

    it('is the folder when the first file comes from a folder', () => {
        expect(defaultDatasetName([{ name: 'a.jpg', fullPath: 'Brighton Beach/day 1/a.jpg' }])).toBe('Brighton Beach');
        expect(defaultDatasetName([{ name: 'a.jpg', webkitRelativePath: 'Field/a.jpg' }])).toBe('Field');
    });

    it('is cut to the name limit of the Registry (256)', () => {
        const long = 'x'.repeat(400) + '.txt';
        expect(DATASET_NAME_MAX_LENGTH).toBe(256);
        expect(defaultDatasetName([{ name: long }])).toBe('x'.repeat(256));
    });

    it('is empty without files', () => {
        expect(defaultDatasetName([])).toBe('');
    });
});

describe('fieldErrorOf', () => {
    it('reads the first message of errors.<field> (D-047), whatever the letter case of the member', () => {
        expect(fieldErrorOf({ errors: { datasetName: ['Use at least one Latin letter'] } }, 'datasetName')).toBe('Use at least one Latin letter');
        expect(fieldErrorOf({ errors: { DatasetName: 'Too long' } }, 'datasetName')).toBe('Too long');
    });

    it('is null when the error names no such field', () => {
        expect(fieldErrorOf({ errors: { visibility: ['bad'] } }, 'datasetName')).toBeNull();
        expect(fieldErrorOf(new Error('x'), 'datasetName')).toBeNull();
        expect(fieldErrorOf(null, 'datasetName')).toBeNull();
    });
});
