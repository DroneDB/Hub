// @ts-check
/**
 * The code points the Roboto of the PDF has a glyph for, in all four of its faces (regular, bold, italic, bold italic),
 * as ranges in hexadecimal: Latin, Latin Extended, Greek, Cyrillic, the general punctuation and the currency signs it
 * has. A code point outside them is drawn as the empty box of the font. pdfmake's own copy of the font is the source:
 * robotoGlyphs.spec.js checks this list against it, so that a change of the font shows there.
 */
const RANGES = '0 2 d 20-7e a0-17f 18f 192 1a0-1a1 1af-1b0 1f0 1fa-1ff 218-21b 237 259 2bc 2c6-2c7 2c9 2d8-2dd 2f3 300-301 303 309 30f 323 '
    + '384-38a 38c 38e-3a1 3a3-3ce 3d1-3d2 3d6 400-486 488-513 1e00-1e01 1e3e-1e3f 1e80-1e85 1e9e 1ea0-1ef9 1f4d 2000-200b 2010-2011 '
    + '2013-2015 2017-201e 2020-2022 2025-2027 2030 2032-2033 2039-203a 203c 2044 2070 2074-208e 20a3-20a4 20a6-20ac 20b1 20b9-20ba '
    + '20bc-20bd 20c1 2105 2113 2116 2122 2126 212e 215b-215e 2202 2206 220f 2211-2212 221a 221e 222b 2248 2260 2264-2265 25a0 25ca-25cb '
    + '25cf ee01-ee02 f6c3 fb01-fb04 feff fffc-fffd';

/** @type {[number, number][]} */
export const ROBOTO_RANGES = RANGES.split(' ').map(range => {
    const [from, to = from] = range.split('-').map(hex => parseInt(hex, 16));
    return /** @type {[number, number]} */ ([from, to]);
});

/**
 * Whether Roboto has a glyph for a code point.
 * @param {number} codePoint
 */
export function robotoHasGlyph(codePoint) {
    let low = 0;
    let high = ROBOTO_RANGES.length - 1;
    while (low <= high) {
        const middle = (low + high) >> 1;
        const [from, to] = ROBOTO_RANGES[middle];
        if (codePoint < from) high = middle - 1;
        else if (codePoint > to) low = middle + 1;
        else return true;
    }
    return false;
}
