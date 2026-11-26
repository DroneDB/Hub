/** orgLogo: the initials of an organization and the look they take on its colour. */
import { describe, it, expect } from 'vitest';
import { colourChannels, initialsLook, orgInitials } from './orgLogo';

describe('orgInitials', () => {
    it('takes the first letters of the first two words of the name, in capitals', () => {
        expect(orgInitials({ name: 'Acme Drone Lab', slug: 'acme' })).toBe('AD');
        expect(orgInitials({ name: 'roof team', slug: 'roof' })).toBe('RT');
        expect(orgInitials({ name: 'Acme', slug: 'acme' })).toBe('A');
    });

    it('falls back to the slug when there is no name, splitting it at its dashes', () => {
        expect(orgInitials({ name: '', slug: 'survey-team' })).toBe('ST');
        expect(orgInitials({ name: null, slug: 'alice' })).toBe('A');
    });

    it('skips words without a letter or digit, and keeps an accented or non-Latin letter whole', () => {
        expect(orgInitials({ name: '- Équipe &', slug: 'x' })).toBe('É');
        expect(orgInitials({ name: '東京 Lab', slug: 'x' })).toBe('東L');
        expect(orgInitials({ name: '(Acme) 2', slug: 'x' })).toBe('A2');
    });

    it('is empty for nothing', () => {
        expect(orgInitials(null)).toBe('');
        expect(orgInitials({ name: '  ', slug: '' })).toBe('');
    });
});

describe('colourChannels', () => {
    it('reads the rgba and the hsla the maps hand out, and nothing else', () => {
        expect(colourChannels('rgba(66, 133, 244, 0.8)')).toEqual([66, 133, 244]);
        expect(colourChannels('hsla(0, 100%, 50%, 0.8)')).toEqual([255, 0, 0]);
        expect(colourChannels('hsla(120, 100%, 25%, 1)')).toEqual([0, 128, 0]);
        expect(colourChannels('var(--x)')).toBeNull();
    });
});

describe('initialsLook', () => {
    it('is an opaque fill with white text on a dark colour', () => {
        expect(initialsLook('rgba(171, 71, 188, 0.8)')).toEqual({ background: 'rgb(171, 71, 188)', color: '#ffffff' });
    });

    it('takes the dark text on a light colour (the yellow of the palette)', () => {
        expect(initialsLook('rgba(253, 216, 53, 0.8)')).toEqual({ background: 'rgb(253, 216, 53)', color: '#111827' });
    });

    it('keeps a colour it cannot read, with white text', () => {
        expect(initialsLook('tomato')).toEqual({ background: 'tomato', color: '#ffffff' });
    });
});
