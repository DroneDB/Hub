/** orgLogo: the initials of an organization and the look they take on its colour. */
import { describe, it, expect } from 'vitest';
import { ORG_LOGO_FILLS, initialsLook, orgInitials } from './orgLogo';

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

/** The hue, 0-360, of a #rrggbb colour. */
function hueOf(hex) {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
    const max = Math.max(r, g, b);
    const d = max - Math.min(r, g, b);
    if (d === 0) return 0;
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (h * 60 + 360) % 360;
}

/** WCAG contrast of two #rrggbb colours (the dark text and the fill; white is #fff). */
function contrast(a, b) {
    const lum = hex => {
        const [r, g, bl] = [1, 3, 5].map(i => {
            const c = parseInt(hex.slice(i, i + 2), 16) / 255;
            return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
    };
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

describe('initialsLook', () => {
    it('is the same fill for the same slug, whatever the name', () => {
        expect(initialsLook('acme')).toEqual(initialsLook('acme'));
        expect(initialsLook('acme').background).toBe(initialsLook('acme').background);
    });

    it('spreads the slugs over the fills', () => {
        const used = new Set(Array.from({ length: 200 }, (_, i) => initialsLook(`org-${i}`).background));
        expect(used.size).toBe(ORG_LOGO_FILLS.length);
    });

    it('never gives an orange, a red or a yellow (hue 0-60 and 330-360), for any of many slugs', () => {
        const slugs = ['', 'a', 'acme', 'survey-team', 'public', ...Array.from({ length: 2000 }, (_, i) => `org-${i}-${(i * 7919).toString(36)}`)];
        for (const slug of slugs) {
            const { background } = initialsLook(slug);
            const hue = hueOf(background);
            expect(hue > 60 && hue < 330, `${slug} -> ${background} has hue ${Math.round(hue)}`).toBe(true);
        }
        for (const fill of ORG_LOGO_FILLS) {
            // Slate has hardly any hue: grey is not a warm colour either
            const hue = hueOf(fill);
            expect(hue > 60 && hue < 330, fill).toBe(true);
        }
    });

    it('gives each fill a text that reads on it (4.5:1), white or the dark text', () => {
        for (const fill of ORG_LOGO_FILLS) {
            const { background, color } = initialsLook([...Array(500).keys()].map(i => `s${i}`).find(slug => initialsLook(slug).background === fill));
            expect(['#ffffff', '#111827']).toContain(color);
            expect(contrast(background, color), `${color} on ${fill}`).toBeGreaterThanOrEqual(4.5);
        }
    });

    it('does not depend on the theme: it names no theme token', () => {
        const { background, color } = initialsLook('acme');
        expect(`${background}${color}`).not.toMatch(/var\(/);
    });
});
