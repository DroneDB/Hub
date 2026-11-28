/**
 * The texts of the PDF as the embedded Roboto can draw them: the pass over the definition (a French number has a narrow
 * no-break space the font lacks, an Arabic one its own digits), the long unbroken runs, and the characters that no font of
 * the PDF has a glyph for, which are listed so that the user is asked before the PDF is made.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fontkit from 'fontkit';
import { buildPdfDocument } from '@/libs/reports/pdf/pdfDocument';
import { options, pdfModel, fullAssets, nodesOf, textOf } from '@/libs/reports/pdf/pdfDocument.fixtures';
import { pdfText, unsupportedCharacters, withPdfText, MOST_UNBROKEN } from '@/libs/reports/pdf/pdfText';
import { ROBOTO_RANGES, robotoHasGlyph } from '@/libs/reports/pdf/robotoGlyphs';
import { REPORT_SYMBOLS } from '@/libs/reports/pdf/reportSymbolsFont';
import { square, mapFeature } from '@/libs/reports/reportModel.fixtures';

const FACES = ['Roboto-Regular.ttf', 'Roboto-Medium.ttf', 'Roboto-Italic.ttf', 'Roboto-MediumItalic.ttf'];

/** The four faces of the Roboto that pdfmake ships, opened. */
async function shippedRoboto() {
    const fonts = await import('pdfmake/build/vfs_fonts');
    const files = fonts.default ?? fonts;
    return FACES.map(name => fontkit.create(Buffer.from(files[name], 'base64')));
}

afterEach(() => vi.restoreAllMocks());

describe('the text the font draws', () => {
    it('has a no-break space for the narrow one of French numbers, which Roboto lacks', () => {
        expect(pdfText('12\u202f345,68 m³')).toBe('12\u00a0345,68 m³');
    });

    it('drops the direction marks, which steer a bidirectional layout the PDF does not have', () => {
        expect(pdfText('\u200f1\u200e2\u061c3\u202a4\u202c5\u2066\u2069')).toBe('12345');
    });

    it('writes the digits of any script as 0-9, and the Arabic signs of a number as the signs next to them', () => {
        expect(pdfText('١٬٢٣٤٫٥')).toBe('1,234.5');
        expect(pdfText('۱۲۳')).toBe('123');
        expect(pdfText('১২৩')).toBe('123');
        expect(pdfText('๑๒')).toBe('12');
        expect(pdfText('１２')).toBe('12');
        expect(pdfText('42 ٤٢٪')).toBe('42 42%');
        // A digit is not changed, and no other text is
        expect(pdfText('Crushed limestone 0-32')).toBe('Crushed limestone 0-32');
    });

    it('writes what Intl gives for a French and an Arabic number so that every character has a glyph', () => {
        const french = new Intl.NumberFormat('fr-FR').format(1234567.891);
        const arabic = new Intl.NumberFormat('ar-EG', { style: 'percent' }).format(0.42) + new Intl.NumberFormat('ar-EG').format(1234.5);
        for (const text of [french, arabic]) {
            for (const character of pdfText(text)) expect(robotoHasGlyph(/** @type {number} */ (character.codePointAt(0))), `U+${character.codePointAt(0)?.toString(16)}`).toBe(true);
        }
    });

    it('puts a zero-width space after every 16 characters of a run that has no place to break', () => {
        const run = 'N'.repeat(40);
        const written = pdfText(run);
        expect(written.split('\u200b').map(part => part.length)).toEqual([MOST_UNBROKEN, MOST_UNBROKEN, 8]);
        expect(written.replaceAll('\u200b', '')).toBe(run);
    });

    it('counts a no-break space as part of the run, as the library never breaks there: a long French figure gets its break', () => {
        // 123 456 789 012,25 m3 written by Intl in French: the spaces are no-break ones once the pass is done
        const figure = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2 }).format(123456789012.25);
        const written = pdfText(figure);
        expect(written).toContain('\u200b');
        expect(written.replaceAll('\u200b', '')).toBe(figure.replace(/\u202f/g, '\u00a0'));
        expect(pdfText('N\u00a0'.repeat(10))).toContain('\u200b');
        // A space that breaks still counts as a place to break
        expect(pdfText('NNNNNNNNNN NNNNNNNNNN')).toBe('NNNNNNNNNN NNNNNNNNNN');
    });

    it('leaves a run that can break, or is short, as it is', () => {
        expect(pdfText('A'.repeat(16))).toBe('A'.repeat(16));
        expect(pdfText('words '.repeat(10))).toBe('words '.repeat(10));
        expect(pdfText('north-quarry-bench-stockpile-east-side')).toBe('north-quarry-bench-stockpile-east-side');
        expect(pdfText('https://hub.example/r/acme/site')).toBe('https://hub.example/r/acme/site');
    });

    it('does not cut a letter from its accent when it breaks a run', () => {
        const run = 'e\u0301'.repeat(20);
        const parts = pdfText(run).split('\u200b');
        for (const part of parts) expect(part.startsWith('\u0301')).toBe(false);
    });

    it('goes through the text of a definition at any depth, runs included, and leaves links, ids and images alone', () => {
        const node = {
            stack: [
                { text: ['1\u202f000', { text: ['٣', { text: 'x'.repeat(20), bold: true }], link: 'https://hub.example/\u202f' }], id: 'a\u202fb' },
                { image: 'data:image/jpeg;base64,\u202f', svg: '<svg>\u202f</svg>' }
            ]
        };
        const out = withPdfText(node);
        expect(out.stack[0].text[0]).toBe('1\u00a0000');
        expect(out.stack[0].text[1].text[0]).toBe('3');
        expect(out.stack[0].text[1].text[1].text).toBe(`${'x'.repeat(16)}\u200b${'x'.repeat(4)}`);
        expect(out.stack[0].text[1].link).toBe('https://hub.example/\u202f');
        expect(out.stack[0].id).toBe('a\u202fb');
        expect(out.stack[1]).toEqual(node.stack[1]);
    });
});

describe('the characters the PDF cannot draw', () => {
    it('are listed once each, in the order they are written; the arrows are in the font of the symbols and are not', () => {
        const definition = { content: [{ text: 'Plan 日本 ฿ → 日' }, { stack: [{ text: [{ text: '₴ ₸', bold: true }] }] }] };
        expect(unsupportedCharacters(definition)).toEqual(['日', '本', '฿', '₴', '₸']);
    });

    it('are none for the Latin, Greek and Cyrillic text, the euro, and the characters of a line break', () => {
        const definition = { content: [{ text: 'Café ° ³ € Γειά Привет – •\n\tend\u00a0 \u200b' }] };
        expect(unsupportedCharacters(definition)).toEqual([]);
    });

    it('are read from the header and the footer too, which are functions of the page', () => {
        const definition = { content: [], header: () => ({ text: '中' }), footer: () => ({ columns: [{ text: 'م' }] }) };
        expect(unsupportedCharacters(definition)).toEqual(['中', 'م']);
    });
});

describe('the glyphs of the shipped Roboto', () => {
    it('are the ranges of robotoGlyphs: the code points all four faces have, no more and no fewer', async () => {
        const faces = await shippedRoboto();
        const listed = new Set(ROBOTO_RANGES.flatMap(([from, to]) => Array.from({ length: to - from + 1 }, (_, i) => from + i)));
        const shared = faces[0].characterSet.filter((/** @type {number} */ codePoint) => faces.every(face => face.hasGlyphForCodePoint(codePoint)));
        expect([...listed].sort((a, b) => a - b)).toEqual([...shared].sort((a, b) => a - b));
    });

    it('lack the narrow no-break space and the direction marks of the locales, and have the no-break space and the zero-width space', async () => {
        const [regular] = await shippedRoboto();
        for (const codePoint of [0x202f, 0x200f, 0x061c]) expect(regular.hasGlyphForCodePoint(codePoint)).toBe(false);
        for (const codePoint of [0xa0, 0x200b, 0x20ac]) expect(regular.hasGlyphForCodePoint(codePoint)).toBe(true);
    });
});

describe('a report written in a French browser', () => {
    it('has a glyph in the shipped Roboto for every character of every text of its PDF, for a figure of 1,000 or more', async () => {
        vi.spyOn(navigator, 'language', 'get').mockReturnValue('fr-FR');
        const pile = mapFeature('s1', '1', 'stockpile', square(9.2, 45.1, 20), {
            name: 'Pile 1', cutVolume: 13000.25, fillVolume: 499.75, netVolume: 12500.5, basePlaneMethod: 'best_fit', materialName: 'Crushed limestone 0-32',
            weightEstimate: { tons: 21000.84, basedOn: 'netVolume' }, costEstimate: { amount: 262506.3, currency: 'EUR' }, currency: 'EUR', category: 'stockpile', status: 'in-progress'
        });
        const model = pdfModel({ features: [pile] });
        // The live page writes the narrow no-break space: this is what the PDF is turned from
        expect(JSON.stringify(model)).toContain('\u202f');
        const definition = buildPdfDocument(model, options(model, fullAssets(model)));
        const faces = await shippedRoboto();
        const symbols = new Set(REPORT_SYMBOLS);
        /** @type {string[]} */
        const texts = [];
        for (const part of [definition.content, definition.header(2, 2), definition.footer(2, 2)]) {
            for (const node of nodesOf(part)) texts.push(textOf(node));
        }
        const characters = new Set(texts.join('').split(''));
        expect(characters.has('\u202f')).toBe(false);
        const missing = [...characters].filter(character => !symbols.has(character) && character >= ' ' && !faces.every(face => face.hasGlyphForCodePoint(/** @type {number} */ (character.codePointAt(0)))));
        expect(missing).toEqual([]);
        expect(unsupportedCharacters(definition)).toEqual([]);
        // The figure is there, in one piece
        expect(texts.join('\n')).toContain('13\u00a0000,25');
    });
});
