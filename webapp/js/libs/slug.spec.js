/**
 * slug: the slug rule comes from /sys/features (FR-XC-12); the Hub runs the Registry's test cases
 * (SlugRulesTests, __vectors__/input-rules.json) against it.
 */
import { describe, it, expect, afterEach } from 'vitest';
import reg from '@/libs/api/sharedRegistry';
import vectors from './__vectors__/input-rules.json';
import { FALLBACK_INPUT_RULES } from './nameRules';
import { isValidSlug, slugProblem, slugDescription, slugFromName, suggestSlug, uniqueSlug } from './slug';

const serve = features => { reg.features.values = features; };
afterEach(() => reg.features.clear());

const DESCRIPTION = "it has 2 to 128 characters (lowercase letters, digits, '_' and '-'), starts with a letter or digit and has no '--'";

describe.each([
    ['published by the Registry', () => serve({ inputRules: JSON.parse(JSON.stringify(FALLBACK_INPUT_RULES)) })],
    ['from an older Registry (built-in rule)', () => serve({})]
])('the Registry test cases, %s', (_, setup) => {
    it('accepts the slugs the Registry accepts and refuses the others', () => {
        setup();
        expect(vectors.slug.accept.filter(s => !isValidSlug(s))).toEqual([]);
        expect(vectors.slug.reject.filter(s => isValidSlug(s))).toEqual([]);
    });

    it('keeps to the length limits', () => {
        setup();
        expect(isValidSlug('a'.repeat(128))).toBe(true);
        expect(isValidSlug('a'.repeat(129))).toBe(false);
    });
});

describe('slug texts', () => {
    it('says what is wrong as the Registry does', () => {
        expect(slugDescription()).toBe(DESCRIPTION);
        expect(slugProblem('Ab', 'Dataset')).toBe(`Dataset slug is invalid: ${DESCRIPTION}`);
        expect(slugProblem(null, 'Organization')).toBe(`Organization slug is invalid: ${DESCRIPTION}`);
        expect(slugProblem('survey-team')).toBeNull();
    });

    it('follows the rule the server publishes', () => {
        serve({ inputRules: { slug: { pattern: '^[a-z]+$', minLength: 3, maxLength: 4, description: 'three or four letters', message: 'Use three or four letters' } } });
        expect(isValidSlug('abc')).toBe(true);
        expect(isValidSlug('ab')).toBe(false);
        expect(isValidSlug('abcde')).toBe(false);
        expect(isValidSlug('ab-c')).toBe(false);
        expect(slugProblem('ab')).toBe('Use three or four letters');
    });
});

// FR-ORG-05, FR-ORG-14: the Hub's generator gives what the Registry's ToSlug gives (the same cases run in SlugRulesTests)
describe('slugFromName', () => {
    it('gives the slug the Registry makes of each shared case', () => {
        expect(vectors.toSlug.length).toBeGreaterThan(10);
        expect(vectors.toSlug.filter(c => slugFromName(c.name) !== c.slug).map(c => [c.name, slugFromName(c.name), c.slug])).toEqual([]);
    });

    it('transliterates the accents and the letters NFD leaves whole', () => {
        expect(slugFromName('Ørsted Café Ü')).toBe('orsted-cafe-u');
        expect(slugFromName('t-orgs Équipe Été')).toBe('t-orgs-equipe-ete');
        expect(slugFromName('Straße ÆØÅ Łódź')).toBe('strasse-aeoa-lodz');
    });

    it('never makes a slug the Registry would refuse, whatever the name', () => {
        for (const name of ['a', '-', '*', '__', 'Москва', '東京 HQ', 'a'.repeat(300), 'x '.repeat(200), '😀 smile']) {
            expect(isValidSlug(slugFromName(name)), name).toBe(true);
        }
    });

    // FR-ORG-14: a 200-character name gives a slug within the limit that does not end with a dash
    it('cuts a long name to the limit and never ends with a dash or an underscore', () => {
        const long = Array.from({ length: 40 }, () => 'word').join(' ');
        const slug = slugFromName(long);
        expect(slug.length).toBeLessThanOrEqual(128);
        expect(slug).not.toMatch(/[-_]$/);
        expect(slugFromName('a'.repeat(127) + ' bbbb')).toBe('a'.repeat(127));
        expect(slugFromName('a'.repeat(127) + '_bbbb')).toBe('a'.repeat(127));
        expect(slugFromName('ß'.repeat(100))).toBe('s'.repeat(128));
    });

    it('is empty for a blank name', () => {
        expect(slugFromName('')).toBe('');
        expect(slugFromName('   ')).toBe('');
        expect(slugFromName(null)).toBe('');
    });
});

describe('suggestSlug', () => {
    it('proposes the slug of a name, and none for a name without a Latin letter or digit (D-035)', () => {
        expect(suggestSlug('Survey Team')).toBe('survey-team');
        expect(suggestSlug('Orsted Café')).toBe('orsted-cafe');
        expect(suggestSlug('Москва')).toBe('');
        expect(suggestSlug('!!!')).toBe('');
        expect(suggestSlug('')).toBe('');
        expect(suggestSlug('Москва 2')).toBe('0-2');
    });
});

describe('uniqueSlug', () => {
    it('is the slug itself when it is free, else the lowest free -n of 2 or more', () => {
        expect(uniqueSlug('aukerman', [])).toBe('aukerman');
        expect(uniqueSlug('aukerman', ['aukerman'])).toBe('aukerman-2');
        expect(uniqueSlug('aukerman', ['aukerman', 'aukerman-2', 'aukerman-4'])).toBe('aukerman-3');
        expect(uniqueSlug('', ['x'])).toBe('');
    });

    // FR-ORG-14: the suffix replaces the end of the base, so the result stays within the limit
    it('keeps a taken slug of the limit length at the limit, ending in -2', () => {
        const taken = 'a'.repeat(128);
        const next = uniqueSlug(taken, [taken]);
        expect(next).toBe('a'.repeat(126) + '-2');
        expect(next).toHaveLength(128);
        expect(isValidSlug(next)).toBe(true);
    });

    it('cuts the base further for a longer suffix and drops a dash the cut leaves', () => {
        const taken = new Set(['a'.repeat(128)]);
        for (let n = 2; n < 10; n++) taken.add(uniqueSlug('a'.repeat(128), taken));
        expect(uniqueSlug('a'.repeat(128), taken)).toBe('a'.repeat(125) + '-10');
        // "a…a-bb" cut to 126 characters ends with '-': it is dropped before the suffix
        const base = 'a'.repeat(125) + '-bb';
        expect(uniqueSlug(base, [base])).toBe('a'.repeat(125) + '-2');
    });
});

describe('slugProblem with the slugs that exist', () => {
    it('says that a slug of the list exists, with the given text', () => {
        const taken = { kind: 'Organization', forbidden: ['survey-team'], taken: 'An organization with this slug already exists' };
        expect(slugProblem('survey-team', taken)).toBe('An organization with this slug already exists');
        expect(slugProblem('survey-team-2', taken)).toBeNull();
        expect(slugProblem('Survey Team', taken)).toContain('Organization slug is invalid');
        expect(slugProblem('taken', { kind: 'Dataset', forbidden: ['taken'] })).toBe('A dataset with this slug already exists');
        expect(slugProblem('taken', { forbidden: ['taken'] })).toBe('This slug already exists');
    });
});
