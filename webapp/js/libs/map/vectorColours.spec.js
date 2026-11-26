/** vectorColours: the colour of a name, and the colour of an organization, one for the map and for its logo. */
import { describe, it, expect } from 'vitest';
import { getVectorColor, organizationColour } from './vectorColours';
import { getVectorColor as fromMapUtils } from './mapUtils';

describe('getVectorColor', () => {
    it('is the same function as the one mapUtils exports', () => {
        expect(fromMapUtils).toBe(getVectorColor);
    });

    it('takes the palette for a small index and derives a colour from the name beyond it, remembered in the cache', () => {
        const cache = {};
        expect(getVectorColor('a', 0, cache)).toBe('rgba(66, 133, 244, 0.8)');
        expect(getVectorColor('a', 5, cache)).toBe('rgba(66, 133, 244, 0.8)');
        expect(getVectorColor('b', 99, {})).toMatch(/^hsla\(\d+, 80%, 45%, 0.8\)$/);
    });
});

describe('organizationColour', () => {
    it('is the colour the map gives the organization when it has given one', () => {
        expect(organizationColour('acme', { acme: 'rgba(1, 2, 3, 0.8)' })).toBe('rgba(1, 2, 3, 0.8)');
    });

    it('is derived from the slug alone otherwise, the same every time and for the same slug only', () => {
        const colour = organizationColour('acme');
        expect(colour).toBe(organizationColour('acme', { other: 'rgba(1, 2, 3, 0.8)' }));
        expect(colour).toBe(getVectorColor('acme', Number.POSITIVE_INFINITY, {}));
        expect(organizationColour('acme')).not.toBe(organizationColour('survey-team'));
    });
});
