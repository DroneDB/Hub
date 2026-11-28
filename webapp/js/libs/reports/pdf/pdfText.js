// @ts-check
/**
 * The texts of the PDF as its font can draw them. The model's texts are the ones of the live page, written in the
 * language of the browser: a French number has a narrow no-break space (U+202F) for the thousands and an Arabic one has
 * Arabic-Indic digits and direction marks, and the embedded Roboto has a glyph for none of them (it is drawn as the box
 * of a missing glyph). So every text of the definition goes through one pass before the library writes it:
 *
 *   - U+202F becomes a no-break space (U+00A0), which Roboto has and which keeps a number in one piece;
 *   - the direction marks (U+200E, U+200F, U+061C and the embedding and isolate controls) are dropped: the PDF has no
 *     bidirectional layout for them to steer;
 *   - the digits of any script become 0-9, and the Arabic decimal, thousands and percent signs the signs next to them;
 *   - a run of characters with no place to break the line (a long name, an address) gets a zero-width space every
 *     16 characters, so that it wraps in its column instead of leaving the page.
 *
 * What is still without a glyph after that (CJK, Hebrew, Thai, a currency sign Roboto lacks) is collected so that the
 * user is told before the PDF is made (unsupportedCharacters).
 */
import { mapTexts } from '@/libs/reports/pdf/pdfSymbols';
import { REPORT_SYMBOLS } from '@/libs/reports/pdf/reportSymbolsFont';
import { robotoHasGlyph } from '@/libs/reports/pdf/robotoGlyphs';

const NO_BREAK_SPACE = '\u00a0';
const ZERO_WIDTH_SPACE = '\u200b';
/** The longest run of characters left with no place to break, in characters */
export const MOST_UNBROKEN = 16;

const NARROW_NO_BREAK_SPACE = /\u202f/g;
const DIRECTION_MARKS = /[\u200e\u200f\u061c\u202a-\u202e\u2066-\u2069]/g;
const DECIMAL_DIGIT = /\p{Nd}/gu;
/** The Arabic signs of a number and what they are in ASCII */
const ARABIC_SIGNS = /** @type {Record<string, string>} */ ({ '\u066a': '%', '\u066b': '.', '\u066c': ',' });
const ARABIC_SIGN = /[\u066a-\u066c]/g;
/**
 * The spaces where the library breaks a line: every white space but the no-break ones (U+00A0, which this pass writes
 * for U+202F, the figure space U+2007, U+202F itself and U+FEFF), at which it never breaks. A French number or amount is
 * one run with no-break spaces in it.
 */
const BREAKING_SPACES = '\\t\\n\\v\\f\\r \\u1680\\u2000-\\u2006\\u2008-\\u200a\\u2028\\u2029\\u205f\\u3000';
/** A run with no breaking space, hyphen or slash in it and no break already: the line cannot be broken inside it */
const UNBROKEN = new RegExp(`[^${BREAKING_SPACES}${ZERO_WIDTH_SPACE}\\-/]{${MOST_UNBROKEN + 1},}`, 'gu');

const IS_DIGIT = /^\p{Nd}$/u;
const decimalDigit = (/** @type {number} */ codePoint) => IS_DIGIT.test(String.fromCodePoint(codePoint));

/**
 * The value of a decimal digit of any script. The digits of a script are ten in a row, the zero first, so the value is
 * the distance to the start of the row.
 * @param {string} digit
 */
function digitValue(digit) {
    const codePoint = /** @type {number} */ (digit.codePointAt(0));
    if (codePoint < 0x80) return digit;
    let zero = codePoint;
    while (zero > 0 && decimalDigit(zero - 1)) zero--;
    return String((codePoint - zero) % 10);
}

/** @param {string} text @returns {string[]} the characters (a letter with its marks is one) */
function graphemes(text) {
    if (typeof Intl.Segmenter === 'function') return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), part => part.segment);
    return Array.from(text);
}

/** A run with a zero-width space after every 16 characters. @param {string} run */
function broken(run) {
    const characters = graphemes(run);
    /** @type {string[]} */
    const chunks = [];
    for (let i = 0; i < characters.length; i += MOST_UNBROKEN) chunks.push(characters.slice(i, i + MOST_UNBROKEN).join(''));
    return chunks.join(ZERO_WIDTH_SPACE);
}

/**
 * A text as the font draws it.
 * @param {string} text
 */
export function pdfText(text) {
    return text
        .replace(DIRECTION_MARKS, '')
        .replace(NARROW_NO_BREAK_SPACE, NO_BREAK_SPACE)
        .replace(ARABIC_SIGN, sign => ARABIC_SIGNS[sign])
        .replace(DECIMAL_DIGIT, digitValue)
        .replace(UNBROKEN, broken);
}

/**
 * The `text` of a node as the font draws it: a string, or the runs of one.
 * @param {any} value
 * @returns {any}
 */
function textValue(value) {
    if (typeof value === 'string') return pdfText(value);
    if (!Array.isArray(value)) return value;
    return value.map(run => (typeof run === 'string' ? pdfText(run) : run && typeof run === 'object' && 'text' in run ? { ...run, text: textValue(run.text) } : run));
}

/**
 * A copy of a part of a definition (a node, a list of them) whose texts are as the font draws them.
 * @template T
 * @param {T} node
 * @returns {T}
 */
export const withPdfText = node => mapTexts(node, textValue);

/** The strings of a `text` value, its runs included. @param {any} value @returns {string[]} */
function stringsOf(value) {
    if (typeof value === 'string') return [value];
    if (!Array.isArray(value)) return [];
    return value.flatMap(run => (typeof run === 'string' ? [run] : run && typeof run === 'object' ? stringsOf(run.text) : []));
}

/**
 * Whether a character is drawn from a glyph: a control character is no text, and the arrows are in the font of the symbols.
 * @param {string} character
 */
function drawable(character) {
    const codePoint = /** @type {number} */ (character.codePointAt(0));
    return codePoint < 0x20 || (codePoint >= 0x7f && codePoint < 0xa0) || robotoHasGlyph(codePoint) || REPORT_SYMBOLS.includes(character);
}

/**
 * The characters of the texts of a definition that no font of the PDF has a glyph for, each once, in the order they are
 * first written. The header and the footer of a definition are functions of the page: they are read for a page that has
 * both (the second).
 * @param {{ content?: any, header?: any, footer?: any }} definition  after withPdfText
 * @returns {string[]}
 */
export function unsupportedCharacters(definition) {
    /** @type {Set<string>} */
    const missing = new Set();
    const collect = (/** @type {any} */ value) => {
        for (const text of stringsOf(value)) for (const character of text) if (!drawable(character)) missing.add(character);
        return value;
    };
    const parts = [definition.content, typeof definition.header === 'function' ? definition.header(2, 2) : definition.header, typeof definition.footer === 'function' ? definition.footer(2, 2) : definition.footer];
    for (const part of parts) if (part) mapTexts(part, collect);
    return [...missing];
}
