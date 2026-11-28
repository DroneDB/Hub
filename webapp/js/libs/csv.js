// @ts-check
/**
 * Comma-separated values (RFC 4180): fields with a comma, a quote, a line break or a space at
 * either end are quoted, a quote inside one is doubled, and rows end with CRLF.
 *
 * Text that a spreadsheet would run as a formula (it starts with an equals sign, a plus, a minus,
 * an at sign, a tab or a carriage return) gets a leading apostrophe, so a name typed by one user cannot run in the spreadsheet
 * of another. Numbers are written as they are, with a dot for the decimals, so -12.5 stays a number.
 */

import { downloadText } from './download';

const NEEDS_QUOTES = /[",\r\n]|^\s|\s$/;
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * One field: empty for null, undefined or a number that is not finite.
 * @param {unknown} value
 * @returns {string}
 */
export function csvField(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
    let text = String(value);
    if (FORMULA_START.test(text)) text = `'${text}`;
    return NEEDS_QUOTES.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * The CSV text of a header and its rows, each row ended with CRLF.
 * @param {readonly string[]} header
 * @param {readonly (readonly unknown[])[]} rows
 * @returns {string}
 */
export function toCsv(header, rows) {
    return [header, ...rows].map(row => row.map(csvField).join(',') + '\r\n').join('');
}

/**
 * Saves CSV text as a file. The file starts with a byte order mark, which spreadsheets need to
 * read it as UTF-8 (m², ft², names with accents).
 * @param {string} csv
 * @param {string} filename
 */
export function downloadCsv(csv, filename) {
    downloadText(`\uFEFF${csv}`, filename, 'text/csv;charset=utf-8');
}
