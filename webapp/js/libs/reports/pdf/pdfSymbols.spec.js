import { describe, it, expect, vi } from 'vitest';
import { withSymbols, addSymbolsFont, SYMBOLS_FONT } from './pdfSymbols';
import { REPORT_SYMBOLS } from './reportSymbolsFont';

describe('the symbols of a report in their own font', () => {
    it('are the arrows', () => {
        expect(REPORT_SYMBOLS).toEqual(['→', '↑', '←', '↓']);
    });

    it('make a text with a symbol runs, the symbol in its font, and leave a text without one as it is', () => {
        expect(withSymbols({ text: 'Back beach → berm crest', style: 'x' })).toEqual({ text: ['Back beach ', { text: '→', font: SYMBOLS_FONT }, ' berm crest'], style: 'x' });
        const plain = { text: 'No arrow', bold: true };
        expect(withSymbols(plain)).toEqual(plain);
        expect(withSymbols({ text: '←↓' })).toEqual({ text: [{ text: '←', font: SYMBOLS_FONT }, { text: '↓', font: SYMBOLS_FONT }] });
    });

    it('keep the style of a run that has a symbol, and reach the texts in stacks, columns and tables', () => {
        const node = {
            stack: [{ text: [{ text: 'A → B', bold: true, color: '#dc2626' }, ' and ↑'] }],
            columns: [{ table: { body: [[{ text: '↓ low' }]] }, layout: { hLineWidth: () => 0 } }]
        };
        const out = withSymbols(node);
        // A run is not nested in a group (pdfmake draws the group without the style of the run): every part has the style
        expect(out.stack[0].text).toEqual([
            { text: 'A ', bold: true, color: '#dc2626' },
            { text: '→', font: SYMBOLS_FONT, bold: true, color: '#dc2626' },
            { text: ' B', bold: true, color: '#dc2626' },
            ' and ', { text: '↑', font: SYMBOLS_FONT }
        ]);
        expect(out.columns[0].table.body[0][0].text).toEqual([{ text: '↓', font: SYMBOLS_FONT }, ' low']);
        // A layout keeps its functions
        expect(typeof out.columns[0].layout.hLineWidth).toBe('function');
    });

    it('keep the link and the style of a run whose text is itself runs, one of which has an arrow', () => {
        const out = withSymbols({ text: [{ text: ['go ', { text: 'there → now', italics: true }], link: 'https://hub.example/a', decoration: 'underline' }] });
        expect(out.text).toEqual([
            { text: 'go ', link: 'https://hub.example/a', decoration: 'underline' },
            { text: 'there ', link: 'https://hub.example/a', decoration: 'underline', italics: true },
            { text: '→', link: 'https://hub.example/a', decoration: 'underline', italics: true, font: SYMBOLS_FONT },
            { text: ' now', link: 'https://hub.example/a', decoration: 'underline', italics: true }
        ]);
    });

    it('leave the data of an image or an SVG alone', () => {
        const node = { image: 'data:image/jpeg;base64,→', svg: '<svg>→</svg>' };
        expect(withSymbols(node)).toEqual(node);
    });

    it('register the font with pdfmake, one file for every style', () => {
        const pdfMake = { addVirtualFileSystem: vi.fn(), addFonts: vi.fn() };
        addSymbolsFont(pdfMake);
        const [vfs] = pdfMake.addVirtualFileSystem.mock.calls[0];
        const [fonts] = pdfMake.addFonts.mock.calls[0];
        const file = fonts[SYMBOLS_FONT].normal;
        expect(Object.keys(vfs)).toEqual([file]);
        expect(fonts[SYMBOLS_FONT]).toEqual({ normal: file, bold: file, italics: file, bolditalics: file });
    });
});
