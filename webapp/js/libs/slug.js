// @ts-check
/**
 * The slug rule of the Registry (`SlugRules`, FR-XC-12, D-014), as `GET /sys/features` publishes it
 * in `inputRules.slug`: the pattern, the limits and the description. Every Hub form that takes or
 * makes a slug checks it here and shows the same text the Registry answers with (AC-036).
 * A Registry that does not publish the rule gets the built-in copy of libs/nameRules.js.
 *
 * It is also the one slug generator (FR-ORG-05, FR-ORG-14): `slugFromName` gives what the Registry's
 * `ToSlug` gives (the shared test cases `toSlug` in __vectors__/input-rules.json run against both),
 * `suggestSlug` is what a form proposes for a name, and `uniqueSlug` adds the `-<n>` suffix of a
 * taken slug within the limits (`SlugSuffix.Candidate`).
 */

import { inputRule, matchesRule, hasLatinLetterOrDigit } from '@/libs/nameRules';

/** The slug rule (pattern, minLength, maxLength, description, message). */
export function slugRule() {
    return inputRule('slug');
}

/** The slug rule as a form shows it (helper text). */
export function slugDescription() {
    return slugRule().description;
}

/**
 * Whether the Registry accepts `slug` as a slug: its length is within the limits and it matches
 * the published pattern.
 * @param {string|null|undefined} slug
 */
export function isValidSlug(slug) {
    if (typeof slug !== 'string') return false;
    const rule = slugRule();
    if (rule.minLength != null && slug.length < rule.minLength) return false;
    if (rule.maxLength != null && slug.length > rule.maxLength) return false;
    return matchesRule(rule.pattern, slug);
}

/**
 * What is wrong with a slug, or null: the message the Registry answers with
 * (`SlugRules.InvalidMessage`: "<kind> slug is invalid: <description>"), or, for a slug in
 * `forbidden` (the slugs that exist), `taken` (what to say, default "A <kind> with this slug
 * already exists").
 * @param {string|null|undefined} slug
 * @param {string | { kind?: string, forbidden?: Iterable<string>, taken?: string }} [options]
 *   what the slug names ('Dataset', 'Organization'), or `{ kind, forbidden, taken }`
 * @returns {string|null}
 */
export function slugProblem(slug, options = 'The') {
    const { kind = 'The', forbidden = [], taken = '' } = typeof options === 'string' ? { kind: options } : options;
    if (!isValidSlug(slug)) {
        const rule = slugRule();
        return rule.message || `${kind} slug is invalid: ${rule.description}`;
    }
    if (slug && [...forbidden].includes(slug)) return taken || (kind === 'The' ? 'This slug already exists' : `A ${kind.toLowerCase()} with this slug already exists`);
    return null;
}

/** The letters NFD leaves whole, as the Registry's ToSlug transliterates them (FR-ORG-05). */
const TRANSLITERATIONS = { 'ø': 'o', 'æ': 'ae', 'ß': 'ss', 'ẞ': 'ss', 'ł': 'l' };

/**
 * The slug the Registry's `ToSlug` makes of a name, character for character: the spaces around the
 * name are dropped, accents are dropped by NFD, ø, æ, ß and ł are transliterated, ASCII capitals
 * are lowercased, anything but [a-z0-9_-] is a dash, a run of dashes is one, a slug that starts
 * with '-' or '_' gets a '0' first, it is cut to the maximum length, a trailing '-' or '_' is
 * dropped (FR-ORG-14) and it is padded with '0' to the minimum length. A name that has no Latin
 * letter or digit gives the internal fallback ("00"), which a form never proposes
 * (`suggestSlug`).
 * @param {string|null|undefined} name
 * @returns {string}  '' for a blank name
 */
export function slugFromName(name) {
    if (typeof name !== 'string' || name.trim() === '') return '';
    const { minLength, maxLength } = limits();
    let slug = '';
    let previousDash = false;
    for (const ch of name.trim().normalize('NFD')) {
        if (/\p{Mn}/u.test(ch)) continue;
        const lower = ch.toLowerCase();
        const piece = TRANSLITERATIONS[lower] ?? (ch >= 'A' && ch <= 'Z' ? lower : ch);
        for (const c of piece) {
            const out = /^[a-z0-9_-]$/.test(c) ? c : '-';
            if (out === '-') {
                if (previousDash) continue;
                previousDash = true;
            } else {
                previousDash = false;
            }
            if (slug.length < maxLength) slug += out;
        }
        if (slug.length >= maxLength) break;
    }
    if (slug === '') return '0'.repeat(minLength);
    if (slug[0] === '-' || slug[0] === '_') slug = '0' + slug;
    if (slug.length > maxLength) slug = slug.slice(0, maxLength);
    slug = slug.replace(/[-_]+$/, '');
    return slug.padEnd(minLength, '0');
}

/**
 * The slug a form proposes for a name: `slugFromName`, or '' when the name has no Latin letter or
 * digit (D-035), so the user has to enter one.
 * @param {string|null|undefined} name
 * @returns {string}
 */
export function suggestSlug(name) {
    return hasLatinLetterOrDigit(name) ? slugFromName(name) : '';
}

/**
 * The first free slug: `base` itself, else `<base>-<n>` with the lowest free n of 2 or more. The
 * suffix replaces the end of the base, so the result keeps to the maximum length: the base is cut
 * to the maximum minus the suffix, and a trailing '-' or '_' is dropped before the suffix, as
 * `SlugSuffix.Candidate` of the Registry does.
 * @param {string|null|undefined} base
 * @param {Iterable<string>} taken  the slugs that exist
 * @returns {string}  '' for no base
 */
export function uniqueSlug(base, taken) {
    if (!base) return '';
    const used = new Set(taken);
    if (!used.has(base)) return base;
    const { maxLength } = limits();
    for (let n = 2; ; n++) {
        const suffix = `-${n}`;
        const cut = base.slice(0, Math.max(0, maxLength - suffix.length)).replace(/[-_]+$/, '');
        const candidate = (cut || '0') + suffix;
        if (!used.has(candidate)) return candidate;
    }
}

/** The length limits of a slug. */
function limits() {
    const rule = slugRule();
    return { minLength: rule.minLength ?? 2, maxLength: rule.maxLength ?? 128 };
}
