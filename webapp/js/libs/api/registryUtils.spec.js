/**
 * The rename of a dataset from its name (FR-ORG-08, FR-XC-11): the slug made of the name goes first, so that a slug the
 * Registry refuses (taken) changes nothing, and the name is saved on the dataset at its new slug.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls = vi.hoisted(() => []);
const datasets = vi.hoisted(() => ({}));
const reg = vi.hoisted(() => ({
    Organization: org => ({
        Dataset: ds => datasets[ds] ?? (datasets[ds] = {
            rename: vi.fn(async slug => { calls.push(['rename', `${org}/${ds}`, slug]); return { slug }; }),
            metaSet: vi.fn(async (key, value) => { calls.push(['metaSet', `${org}/${ds}`, key, value]); })
        })
    })
}));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: reg }));

const { renameDataset } = await import('./registryUtils');

beforeEach(() => {
    calls.length = 0;
    for (const key of Object.keys(datasets)) delete datasets[key];
});

describe('renameDataset', () => {
    it('renames the slug first, then saves the name on the dataset at its new slug', async () => {
        await expect(renameDataset('org', 'survey-a', 'Survey B')).resolves.toEqual({ slug: 'survey-b' });
        expect(calls).toEqual([['rename', 'org/survey-a', 'survey-b'], ['metaSet', 'org/survey-b', 'name', 'Survey B']]);
    });

    it('changes nothing when the slug is refused, and throws the refusal', async () => {
        const taken = Object.assign(new Error("Dataset 'survey-b' already exists"), { status: 400 });
        reg.Organization('org').Dataset('survey-a').rename.mockRejectedValueOnce(taken);
        await expect(renameDataset('org', 'survey-a', 'Survey B')).rejects.toBe(taken);
        expect(calls).toEqual([]);
    });

    it('saves only the name when it gives the slug the dataset has', async () => {
        await expect(renameDataset('org', 'survey-b', 'Survey  B')).resolves.toEqual({ slug: 'survey-b' });
        expect(calls).toEqual([['metaSet', 'org/survey-b', 'name', 'Survey  B']]);
    });

    // D-035: a name with no Latin letter or digit makes no slug; the dataset keeps its own
    it('keeps the slug and saves only the name when the name makes no slug', async () => {
        await expect(renameDataset('org', 'survey-a', 'Москва')).resolves.toEqual({ slug: 'survey-a' });
        expect(calls).toEqual([['metaSet', 'org/survey-a', 'name', 'Москва']]);
    });
});
