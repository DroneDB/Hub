/** What a raster profile says about its series: its samples, the ones with a value and the range of the value axis. */
import { describe, it, expect } from 'vitest';
import { profileSamples, validProfileSamples, profileRange } from './profileSeries';

const samples = values => values.map((value, i) => ({ distance: i, value }));

describe('profileSeries', () => {
    it('has no samples for no profile', () => {
        expect(profileSamples(null)).toEqual([]);
        expect(profileSamples({})).toEqual([]);
        expect(validProfileSamples(undefined)).toEqual([]);
    });

    it('keeps the samples that have a value', () => {
        const profile = { samples: samples([1, null, 0, undefined]) };
        expect(validProfileSamples(profile).map(s => s.value)).toEqual([1, 0]);
    });

    it('takes the range the server reports, a zero included', () => {
        expect(profileRange({ samples: samples([5, 6]), min: 0, max: 10 })).toEqual({ min: 0, max: 10 });
    });

    it('takes the range of the samples that have a value when the server gives none, and 0 to 1 with none', () => {
        expect(profileRange({ samples: samples([5, null, 9, 2]) })).toEqual({ min: 2, max: 9 });
        expect(profileRange({ samples: samples([null]) })).toEqual({ min: 0, max: 1 });
        expect(profileRange(null)).toEqual({ min: 0, max: 1 });
    });
});
