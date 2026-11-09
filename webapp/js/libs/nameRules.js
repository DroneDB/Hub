// @ts-check
/**
 * The input rules the Registry owns (FR-XC-12, D-014), as `GET /sys/features` publishes them in
 * `inputRules`: e-mail, entry names, the "already exists" message and its case rule (D-040), the
 * cron words that switch a job off and the Latin letter rule of organization and dataset names
 * (D-035). Slugs are in libs/slug.js, which reads the same rules. Every Hub form checks its input
 * here, and shows the published description or message at the field (AC-036).
 *
 * FALLBACK_INPUT_RULES is not a second source of truth: it is what the Registry publishes (its
 * golden sys-features.json), used field by field only when the server did not send a value (an
 * older Registry, or a features request that failed). The server's check stays the authority.
 */

import reg from '@/libs/api/sharedRegistry';
import { Features } from '@/libs/features';

/**
 * @typedef {{ pattern: string, minLength: number|null, maxLength: number|null, description: string, message: string|null }} PatternRule
 * @typedef {{ pattern: string, reservedNames: string[], rootReservedNames: string[], description: string }} EntryNameRule
 * @typedef {{ message: string, caseInsensitive: boolean }} NameClashRule
 * @typedef {{ disableWords: string[], description: string }} CronRule
 * @typedef {{ pattern: string, normalization: string, description: string, message: string, messageWithoutSlug: string }} LatinNameRule
 * @typedef {{ slug: PatternRule, email: PatternRule, entryName: EntryNameRule, nameClash: NameClashRule, cron: CronRule, latinName: LatinNameRule }} InputRules
 */

/** The rules as the Registry publishes them (Registry.Web.UnitTest golden sys-features.json). */
export const FALLBACK_INPUT_RULES = /** @type {Readonly<InputRules>} */ (Object.freeze({
    slug: Object.freeze({
        pattern: '^(?!.*--)[a-z0-9][a-z0-9_\\-]{1,127}$',
        minLength: 2,
        maxLength: 128,
        description: "it has 2 to 128 characters (lowercase letters, digits, '_' and '-'), starts with a letter or digit and has no '--'",
        message: null
    }),
    email: Object.freeze({
        pattern: '^[^\\s@]+@[^\\s@]+$',
        minLength: null,
        maxLength: null,
        description: 'one address, such as name@example.com',
        message: 'The e-mail address is not valid: enter one address, such as name@example.com'
    }),
    entryName: Object.freeze({
        pattern: '^(?![A-Za-z]:)(?!\\.\\.?$)(?!\\s*$)[^\\/\\\\\\u0000]+$',
        reservedNames: Object.freeze(['.ddb']),
        rootReservedNames: Object.freeze(['.uploads']),
        description: "a name that is not empty, not '.' or '..', has no '/', '\\' or NUL character, does not start with a drive (such as 'C:') and is not a reserved name"
    }),
    nameClash: Object.freeze({
        message: "A file or folder named '{name}' already exists in this folder",
        caseInsensitive: true
    }),
    cron: Object.freeze({
        disableWords: Object.freeze(['disabled', 'off', 'none']),
        description: "leave it empty for the default schedule; 'disabled', 'off' or 'none' (any case) turns the job off"
    }),
    latinName: Object.freeze({
        pattern: '[A-Za-z0-9]',
        normalization: 'NFD',
        description: 'the name needs a Latin letter (a–z) or a digit (accents are dropped), unless you enter a slug',
        message: 'Use at least one Latin letter (a–z) or digit in the name, or enter a slug',
        messageWithoutSlug: 'Use at least one Latin letter (a–z) or digit'
    })
}));

/** The features object (`reg.features`), or null in a test that mocks the registry without it. */
function served() {
    const features = /** @type {any} */ (reg)?.features;
    const value = typeof features?.value === 'function' ? features.value(Features.INPUT_RULES) : null;
    return value && typeof value === 'object' ? value : null;
}

/**
 * One rule: each field the server sent, else the built-in value of that field.
 * @template {keyof InputRules} K
 * @param {K} name
 * @returns {InputRules[K]}
 */
export function inputRule(name) {
    const fallback = FALLBACK_INPUT_RULES[name];
    const rule = served()?.[name];
    if (!rule || typeof rule !== 'object') return fallback;
    /** @type {Record<string, any>} */
    const merged = { ...fallback };
    for (const [key, value] of Object.entries(rule)) {
        if (value !== null && value !== undefined) merged[key] = value;
    }
    return /** @type {InputRules[K]} */ (merged);
}

/** @type {Map<string, RegExp | null>} */
const compiled = new Map();

/**
 * A published pattern as a RegExp (the patterns are ECMAScript, with the `u` flag); null when this
 * browser cannot compile it, so the check is left to the server.
 * @param {string} pattern
 * @returns {RegExp | null}
 */
export function rulePattern(pattern) {
    if (!compiled.has(pattern)) {
        let re = null;
        try {
            re = new RegExp(pattern, 'u');
        } catch (e) {
            console.error('Cannot compile the input rule pattern', pattern, e);
        }
        compiled.set(pattern, re);
    }
    return compiled.get(pattern) ?? null;
}

/**
 * Whether `value` matches the pattern (a pattern the browser cannot compile lets everything through).
 * @param {string} pattern @param {string} value
 */
export function matchesRule(pattern, value) {
    const re = rulePattern(pattern);
    return re ? re.test(value) : true;
}

// ---- E-mail ---------------------------------------------------------------------------------

/** The e-mail rule as a form shows it (helper text). */
export function emailDescription() {
    return inputRule('email').description;
}

/**
 * The pre-check of one e-mail address: the published pattern on the trimmed value (the server
 * trims it too). It is looser than the server's parser, which decides.
 * @param {string|null|undefined} value
 */
export function isEmail(value) {
    if (typeof value !== 'string') return false;
    return matchesRule(inputRule('email').pattern, value.trim());
}

/**
 * What is wrong with an e-mail field, or null. A blank one is fine when the field is optional.
 * @param {string|null|undefined} value
 * @param {{ optional?: boolean }} [options]
 * @returns {string|null}
 */
export function emailProblem(value, { optional = true } = {}) {
    const blank = typeof value !== 'string' || value.trim() === '';
    if (blank && optional) return null;
    if (isEmail(value)) return null;
    const rule = inputRule('email');
    return rule.message || `The e-mail address is not valid: enter ${rule.description}`;
}

// ---- Entry names ----------------------------------------------------------------------------

/** The entry name rule as a form shows it. */
export function entryNameDescription() {
    return inputRule('entryName').description;
}

/** @param {string} s */
const asciiLower = s => s.replace(/[A-Z]/g, c => c.toLowerCase());

/**
 * Whether `name` is one entry name the Registry accepts: the published pattern, no name reserved in
 * every folder (any ASCII letter case) and, at the root of the dataset, no root reserved name (as
 * written). The aliases libddb also reserves (".ddb.", "DDB~1") are left to the server.
 * @param {string|null|undefined} name
 * @param {{ atRoot?: boolean }} [options]  atRoot: the entry is at the root of the dataset
 */
export function isEntryName(name, { atRoot = false } = {}) {
    if (typeof name !== 'string') return false;
    const rule = inputRule('entryName');
    if (!matchesRule(rule.pattern, name)) return false;
    const lower = asciiLower(name);
    if ((rule.reservedNames || []).some(r => asciiLower(r) === lower)) return false;
    if (atRoot && (rule.rootReservedNames || []).includes(name)) return false;
    return true;
}

// ---- "Already exists" (D-040) ---------------------------------------------------------------

/**
 * The one "already exists" message, for `name`.
 * @param {string} name
 */
export function nameClashMessage(name) {
    return inputRule('nameClash').message.replace('{name}', () => String(name));
}

/**
 * Whether two names in one folder are the same name for the Registry (it ignores letter case).
 * @param {string|null|undefined} a @param {string|null|undefined} b
 */
export function namesClash(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    return inputRule('nameClash').caseInsensitive ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/**
 * A name for a new entry that no sibling has (FR-XC-07): `name` itself when it is free, else
 * `<stem> (<n>).<ext>` with the lowest free n of 2 or more, put before the last extension
 * ("a.b.tif" -> "a.b (2).tif"), or `<name> (<n>)` for a name without one (a leading dot, as in
 * ".env", is not an extension). Names are compared by the rule of D-040 (namesClash).
 * @param {string} name  one entry name, without its folder
 * @param {Iterable<string|null|undefined>} siblings  the names of the entries of the folder
 * @returns {string}
 */
export function freeName(name, siblings) {
    const taken = [...siblings].filter(s => typeof s === 'string');
    const isTaken = (/** @type {string} */ candidate) => taken.some(s => namesClash(s, candidate));
    if (!isTaken(name)) return name;

    const dot = name.lastIndexOf('.');
    const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
    for (let n = 2; ; n++) {
        const candidate = `${stem} (${n})${ext}`;
        if (!isTaken(candidate)) return candidate;
    }
}

// ---- Cron -----------------------------------------------------------------------------------

/** The cron rule as a form shows it. */
export function cronDescription() {
    return inputRule('cron').description;
}

/** The words that switch a scheduled job off. */
export function cronDisableWords() {
    return [...inputRule('cron').disableWords];
}

/**
 * Whether a cron value switches the job off (one of the words, in any case, spaces around it ignored).
 * @param {string|null|undefined} value
 */
export function isCronDisableWord(value) {
    if (typeof value !== 'string') return false;
    const word = value.trim().toLowerCase();
    return inputRule('cron').disableWords.some(w => w.toLowerCase() === word);
}

// ---- Latin letter or digit in a name (D-035) ------------------------------------------------

/** The Latin letter rule as a form shows it. */
export function latinNameDescription() {
    return inputRule('latinName').description;
}

/**
 * Whether a name keeps a Latin letter or a digit once its accents are dropped (the published
 * normalization, then no combining mark), which a slug made from it needs.
 * @param {string|null|undefined} name
 */
export function hasLatinLetterOrDigit(name) {
    if (typeof name !== 'string' || name === '') return false;
    const rule = inputRule('latinName');
    let normalized;
    try {
        normalized = name.normalize(/** @type {'NFD'} */ (rule.normalization || 'NFD'));
    } catch {
        // A form this browser does not know: the one the slug generator applies
        normalized = name.normalize('NFD');
    }
    return matchesRule(rule.pattern, normalized.replace(/\p{Mn}/gu, ''));
}

/**
 * What is wrong with an organization or dataset name by the rule of D-035, or null: the name, or
 * the slug the user enters, needs a Latin letter or a digit.
 * @param {string|null|undefined} name
 * @param {{ slug?: string|null, withSlugField?: boolean }} [options]
 *   slug: the slug the user entered; withSlugField: the form has a slug field (it picks the message)
 * @returns {string|null}
 */
export function latinNameProblem(name, { slug = null, withSlugField = true } = {}) {
    if (hasLatinLetterOrDigit(name) || hasLatinLetterOrDigit(slug)) return null;
    const rule = inputRule('latinName');
    return withSlugField ? rule.message : rule.messageWithoutSlug;
}
