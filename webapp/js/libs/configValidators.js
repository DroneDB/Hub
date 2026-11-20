// @ts-check
/**
 * The validators of the Configuration page, one per field type (FR-ADM-06, FR-XC-11): pure
 * `xxxProblem(value)` functions that give the rule to show next to an invalid field, or null. A blank
 * value is never a problem: it means the default (`null` for a JSON value). The module also holds the
 * hint and the placeholder of each type (FR-ADM-13), so a field says the rule its validator checks.
 *
 * - cron: the rule of the Registry (`inputRules.cron`, libs/nameRules.js): blank, a word that switches
 *   the job off (`disabled`, `off`, `none`, any case), a macro (`@daily`, any case) or 5 or 6 fields. These are the forms
 *   the scheduler (Hangfire, Cronos) reads; what is inside a field is left to the Registry;
 * - timespan: what .NET `TimeSpan.Parse` accepts with the invariant culture, the form the Registry
 *   reads (`d`, `[d.]hh:mm[:ss[.fffffff]]`, `d:hh:mm` or `d:hh:mm:ss[.fffffff]`; the Registry unit tests run the
 *   shared cases against `TimeSpan.TryParse`);
 * - json: `JSON.parse`.
 */
import { cronDisableWords, cronFieldCount, isCronDisableWord, isCronMacro } from '@/libs/nameRules';

/** The field types that have a validator. */
export const VALIDATED_TYPES = Object.freeze(['timespan', 'cron', 'json']);

/** @param {unknown} value */
const blank = value => value === null || value === undefined || (typeof value === 'string' && value.trim() === '');

// ---- timespan -------------------------------------------------------------------------------

/** The longest time span of .NET, 10675199.02:48:05.4775807, in whole seconds and in ticks of the fraction. */
const MAX_SECONDS = 922337203685;
const MAX_FRACTION_TICKS = 4775807;

const DAYS_ONLY = /^\d+$/;
// [d.]h:m[:s[.f]]  (the days, the seconds and the fraction are optional; .NET also reads "h:m:.f": no seconds before the fraction)
const CLOCK = /^(?:(\d+)\.)?(\d+):(\d+)(?::(\d*)(?:\.(\d+))?)?$/;
// d:h:m:s[.f]
const DAYS_CLOCK = /^(\d+):(\d+):(\d+):(\d*)(?:\.(\d+))?$/;

/**
 * Whether .NET reads `text` as a time span (`TimeSpan.TryParse`, invariant culture). The forms, as the
 * Registry unit tests run them against the real parser:
 * - `d`: days;
 * - `[d.]hh:mm`, `[d.]hh:mm:ss[.f]`: the hours are at most 23, with or without the day part, so "24:00" is not a time span;
 * - `d:hh:mm:ss[.f]`: the hours are at most 23;
 * - `d:hh:mm`: three numbers whose first is above 23 are days, hours and minutes
 *   and they take no fraction (.NET reads "24:00:00" as 24 days);
 * - the minutes and the seconds are at most 59 and the whole is at most 10675199.02:48:05.4775807.
 * @param {string} text
 */
function isTimespan(text) {
    let t = text.trim();
    if (t.startsWith('-')) t = t.slice(1);

    let days, hours = 0, minutes = 0, seconds = 0, fraction = '0';
    let match;
    if (DAYS_ONLY.test(t)) {
        days = Number(t);
    } else if ((match = CLOCK.exec(t))) {
        const hasDays = match[1] !== undefined;
        days = hasDays ? Number(match[1]) : 0;
        hours = Number(match[2]);
        minutes = Number(match[3]);
        seconds = match[4] === undefined ? 0 : Number(match[4]);
        fraction = match[5] ?? '0';
        if (match[4] === '' && match[5] === undefined) return false; // "h:m:" says nothing after the colon
        if (hours > 23) {
            // Three numbers with no day part and a first above 23: days, hours and minutes (no fraction)
            if (hasDays || match[4] === undefined || match[5] !== undefined) return false;
            days = hours;
            hours = minutes;
            minutes = seconds;
            seconds = 0;
        }
    } else if ((match = DAYS_CLOCK.exec(t))) {
        days = Number(match[1]);
        hours = Number(match[2]);
        minutes = Number(match[3]);
        seconds = Number(match[4]);
        fraction = match[5] ?? '0';
        if (match[4] === '' && match[5] === undefined) return false;
    } else {
        return false;
    }
    if (hours > 23 || minutes > 59 || seconds > 59) return false;
    // The fraction is any number of digits, but .NET refuses one whose digits (after the leading zeros) are more than 7
    if (fraction.replace(/^0+/, '').length > 7) return false;

    const total = days * 86400 + hours * 3600 + minutes * 60 + seconds;
    if (total > MAX_SECONDS) return false;
    return total < MAX_SECONDS || Number(fraction.padEnd(7, '0').slice(0, 7)) <= MAX_FRACTION_TICKS;
}

/**
 * What is wrong with a time span, or null.
 * @param {string|null|undefined} value
 * @returns {string|null}
 */
export function timespanProblem(value) {
    if (blank(value)) return null;
    if (isTimespan(String(value))) return null;
    return 'Not a valid time span: use days (such as 2) or [days.]hh:mm[:ss] with hours up to 23 (such as 00:30:00 for 30 minutes).';
}

// ---- cron -----------------------------------------------------------------------------------

/**
 * What is wrong with a cron setting, or null. Blank takes the default of the job and a disable word
 * switches it off; a macro is a schedule; any other value has 5 or 6 fields.
 * @param {string|null|undefined} value
 * @returns {string|null}
 */
export function cronProblem(value) {
    if (blank(value) || isCronDisableWord(String(value)) || isCronMacro(String(value))) return null;
    const { min, max } = cronFieldCount();
    const fields = String(value).trim().split(/\s+/).length;
    if (fields >= min && fields <= max) return null;
    return `Not a valid cron expression: use ${min} or ${max} fields separated by spaces (such as 0 0 * * *), `
        + `a macro such as @daily, or ${cronDisableWords().join(', ')} to turn the job off.`;
}

// ---- json -----------------------------------------------------------------------------------

/**
 * What is wrong with a JSON value, or null.
 * @param {string|null|undefined} value
 * @returns {string|null}
 */
export function jsonProblem(value) {
    if (blank(value)) return null;
    try {
        JSON.parse(String(value));
        return null;
    } catch (e) {
        const reason = e instanceof Error ? e.message : '';
        return reason ? `Not valid JSON: ${reason}` : 'Not valid JSON.';
    }
}

// ---- by field type --------------------------------------------------------------------------

/**
 * @typedef {{ fieldType?: string, defaultValue?: string|null }} ConfigField
 */

/**
 * What is wrong with the value of a field, by its type, or null (a type without a validator has none).
 * @param {ConfigField} field
 * @param {unknown} value  the value as typed
 * @returns {string|null}
 */
export function fieldProblem(field, value) {
    switch (field.fieldType) {
        case 'timespan': return timespanProblem(/** @type {string|null|undefined} */ (value));
        case 'cron': return cronProblem(/** @type {string|null|undefined} */ (value));
        case 'json': return jsonProblem(/** @type {string|null|undefined} */ (value));
        default: return null;
    }
}

/**
 * The placeholder of an empty field: the default it takes, in words nobody mistakes for a value
 * (FR-ADM-13). Only cron and timespan fields have one.
 * @param {ConfigField} field
 * @returns {string|undefined}
 */
export function fieldPlaceholder(field) {
    if (field.fieldType !== 'cron' && field.fieldType !== 'timespan') return undefined;
    return field.defaultValue ? `Default: ${field.defaultValue}` : 'Not set';
}

/**
 * The hint under a field: the rule its validator checks. Only cron and timespan fields have one.
 * @param {ConfigField} field
 * @returns {string|undefined}
 */
export function fieldHint(field) {
    if (field.fieldType === 'timespan') {
        return 'Days, or [days.]hh:mm[:ss] with hours up to 23. For example 00:30:00 is 30 minutes, 1.12:00:00 is 1 day and 12 hours. A number alone is days: for one day write 1 or 1.00:00:00, not 24:00:00 (that is 24 days).';
    }
    if (field.fieldType === 'cron') {
        const { min, max } = cronFieldCount();
        return `Cron expression of ${min} or ${max} fields, or a macro such as @daily or @hourly. `
            + `Empty takes the default; ${cronDisableWords().join(', ')} (any case) turns the job off.`;
    }
    return undefined;
}
