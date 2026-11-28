// @ts-check
/**
 * The one QR code of the Hub: the live report page and the PDF of a report both draw it from here, so that a code on
 * paper and a code on the screen are the same pattern. The encoder (qrcode-generator) is a chunk of its own: import
 * this module with `import()` where it is needed, never at the top of a module the first page loads.
 *
 * Whether an address may have a code is libs/originUrl. A code is data (`size`, and `path`, the dark modules as an SVG path in module units with the quiet zone around), not
 * markup: the page puts the path in an <svg>, the PDF writes the same path in the SVG it hands to the PDF library.
 */
import qrcode from 'qrcode-generator';

/** The quiet zone around a code, in modules (the specification asks for 4) */
export const QUIET_ZONE = 4;

/**
 * The text a code encodes: the address as a URL gives it (every character is ASCII, percent-encoded or punycode), so
 * the encoder's single-byte mode reads it back whatever the name of the report. A text that is not an address is
 * kept as it is.
 * @param {string} text
 */
function encodable(text) {
    try {
        return new URL(text).href;
    } catch {
        return text;
    }
}

/**
 * The code of a text.
 * @param {string} text
 * @returns {{ size: number, path: string }}  `size`: the side of the code with its quiet zone, in modules; `path`: the
 *   SVG path of the dark modules in a viewBox of `0 0 size size` (a run of dark modules in a row is one rectangle)
 */
export function qrCode(text) {
    const code = qrcode(0, 'M');
    code.addData(encodable(text));
    code.make();
    const count = code.getModuleCount();
    const parts = [];
    for (let row = 0; row < count; row++) {
        let column = 0;
        while (column < count) {
            if (!code.isDark(row, column)) {
                column++;
                continue;
            }
            const start = column;
            while (column < count && code.isDark(row, column)) column++;
            parts.push(`M${start + QUIET_ZONE} ${row + QUIET_ZONE}h${column - start}v1h-${column - start}z`);
        }
    }
    return { size: count + 2 * QUIET_ZONE, path: parts.join('') };
}

/**
 * The code as a stand-alone SVG document, for a consumer that takes markup (the PDF library).
 * @param {{ size: number, path: string }} code
 * @param {number} [pixels]  the width and height the SVG declares
 */
export function qrSvg(code, pixels = code.size) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${pixels}" height="${pixels}" viewBox="0 0 ${code.size} ${code.size}">`
        + `<rect width="${code.size}" height="${code.size}" fill="#ffffff"/><path d="${code.path}" fill="#000000"/></svg>`;
}
