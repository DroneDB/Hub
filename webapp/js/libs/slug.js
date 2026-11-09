// @ts-check
/**
 * The slug rule of the Registry (`SlugRules`, FR-XC-12, D-014), as `GET /sys/features` publishes it
 * in `inputRules.slug`: the pattern, the limits and the description. Every Hub form that takes or
 * makes a slug checks it here and shows the same text the Registry answers with (AC-036).
 * A Registry that does not publish the rule gets the built-in copy of libs/nameRules.js.
 */

import { inputRule, matchesRule } from '@/libs/nameRules';

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
 * (`SlugRules.InvalidMessage`: "<kind> slug is invalid: <description>").
 * @param {string|null|undefined} slug
 * @param {string} [kind]  what the slug names: 'Dataset', 'Organization'
 * @returns {string|null}
 */
export function slugProblem(slug, kind = 'The') {
    if (isValidSlug(slug)) return null;
    const rule = slugRule();
    return rule.message || `${kind} slug is invalid: ${rule.description}`;
}
