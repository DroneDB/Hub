/**
 * slug: the slug rule comes from /sys/features (FR-XC-12); the Hub runs the Registry's test cases
 * (SlugRulesTests, __vectors__/input-rules.json) against it.
 */
import { describe, it, expect, afterEach } from 'vitest';
import reg from '@/libs/api/sharedRegistry';
import vectors from './__vectors__/input-rules.json';
import { FALLBACK_INPUT_RULES } from './nameRules';
import { isValidSlug, slugProblem, slugDescription } from './slug';

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
