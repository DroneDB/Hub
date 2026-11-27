// @ts-check
/**
 * The symbols of a report that Roboto, the font of the PDF, has no glyph for (the arrows: → ← ↑ ↓), written in
 * ReportSymbols, a font of their own made from the SVGs of webapp/fonts/report-symbols (scripts/build_report_symbols.mjs).
 * pdfmake draws a run of text in one font and leaves out an SVG put in a line, so each symbol becomes a run of that font
 * in the line: it flows and wraps with the text around it, at its size and in its colour. Without it a symbol is an empty
 * box. Every text of the definition goes through here, the user's (names, descriptions, notes) and the report's alike.
 */
import { REPORT_SYMBOLS, REPORT_SYMBOLS_FONT } from '@/libs/reports/pdf/reportSymbolsFont';

/** The name of the font in the definition */
export const SYMBOLS_FONT = 'ReportSymbols';
const FILE = 'ReportSymbols.ttf';
const SPLIT = new RegExp(`([${REPORT_SYMBOLS.join('')}])`, 'u');

/**
 * Registers the font with pdfmake: its file in the virtual file system and its family (one file for every style).
 * @param {any} pdfMake
 */
export function addSymbolsFont(pdfMake) {
    pdfMake.addVirtualFileSystem({ [FILE]: REPORT_SYMBOLS_FONT });
    pdfMake.addFonts({ [SYMBOLS_FONT]: { normal: FILE, bold: FILE, italics: FILE, bolditalics: FILE } });
}

/** @param {string} text */
const hasSymbol = text => SPLIT.test(text);

/**
 * A text as runs: the symbols in their font, the rest as it was.
 * @param {string} text
 * @returns {any[]}
 */
function runsOf(text) {
    return text.split(SPLIT).filter(part => part !== '').map(part => (REPORT_SYMBOLS.includes(part) ? { text: part, font: SYMBOLS_FONT } : part));
}

/**
 * The text of a node with its symbols in their font: a string becomes runs, a run with a symbol becomes runs that keep
 * its style.
 * @param {any} text
 */
function symbolText(text) {
    if (typeof text === 'string') return hasSymbol(text) ? runsOf(text) : text;
    if (!Array.isArray(text)) return text;
    return text.flatMap(run => {
        if (typeof run === 'string') return hasSymbol(run) ? runsOf(run) : [run];
        if (run && typeof run.text === 'string' && hasSymbol(run.text)) return [{ ...run, text: runsOf(run.text) }];
        if (run && Array.isArray(run.text)) return [{ ...run, text: symbolText(run.text) }];
        return [run];
    });
}

/**
 * A copy of a part of a definition (a node, a list of them) whose texts have their symbols in their font. What has none is
 * returned as it is.
 * @template T
 * @param {T} node
 * @returns {T}
 */
export function withSymbols(node) {
    if (Array.isArray(node)) return /** @type {any} */ (node.map(withSymbols));
    if (!node || typeof node !== 'object') return node;
    /** @type {Record<string, any>} */
    const out = {};
    for (const [key, value] of Object.entries(node)) {
        if (key === 'text') out[key] = symbolText(value);
        // The data of an image or an SVG, and the functions of a table layout, are no text
        else if (key === 'image' || key === 'svg' || typeof value === 'function') out[key] = value;
        else out[key] = value && typeof value === 'object' ? withSymbols(value) : value;
    }
    return /** @type {T} */ (out);
}
