// Builds ReportSymbols, the small font of the symbols the report PDFs draw that Roboto has no glyph for (the arrows).
//
// pdfmake writes a run of text in one font and drops an SVG put in a line of text, so a symbol that flows with the text
// (and wraps with it) has to be a glyph. Each glyph is the polygon of an SVG of webapp/fonts/report-symbols, in font units
// (1000 to the em, y up from the baseline), as a TrueType outline; the left, up and down arrows are the right one turned.
//
//   node scripts/build_report_symbols.mjs   writes webapp/js/libs/reports/pdf/reportSymbolsFont.js (the font, base64)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(root, 'webapp/fonts/report-symbols/arrow-right.svg');
const OUTPUT = path.join(root, 'webapp/js/libs/reports/pdf/reportSymbolsFont.js');

const UNITS_PER_EM = 1000;
const ASCENDER = 750;
const DESCENDER = -250;
const ADVANCE = 900;
// The axis the arrows turn about: the middle of the right arrow
const CENTRE = { x: 422.5, y: 280 };

/** The points of the polygon of an SVG. @param {string} file @returns {[number, number][]} */
function polygonOf(file) {
    const match = /points="([^"]+)"/.exec(fs.readFileSync(file, 'utf8'));
    if (!match) throw new Error(`${file} has no polygon`);
    return match[1].trim().split(/\s+/).map(pair => /** @type {[number, number]} */ (pair.split(',').map(Number)));
}

/** A polygon turned by a multiple of 90° about the centre. @param {[number, number][]} points @param {number} quarter */
function turned(points, quarter) {
    return points.map(([x, y]) => {
        let dx = x - CENTRE.x;
        let dy = y - CENTRE.y;
        for (let i = 0; i < quarter; i++) [dx, dy] = [-dy, dx];
        return /** @type {[number, number]} */ ([Math.round(CENTRE.x + dx), Math.round(CENTRE.y + dy)]);
    });
}

/** A TrueType outer contour goes clockwise (y up): the shoelace area is negative. @param {[number, number][]} points */
function clockwise(points) {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
        const [x1, y1] = points[i];
        const [x2, y2] = points[(i + 1) % points.length];
        area += x1 * y2 - x2 * y1;
    }
    return area > 0 ? [...points].reverse() : points;
}

// ---- Binary writing --------------------------------------------------------------------------------------------------

class Writer {
    constructor() { this.bytes = []; }
    u8(v) { this.bytes.push(v & 255); return this; }
    u16(v) { return this.u8(v >> 8).u8(v); }
    i16(v) { return this.u16(v < 0 ? v + 65536 : v); }
    u32(v) { return this.u16(Math.floor(v / 65536) & 65535).u16(v & 65535); }
    tag(s) { for (const c of s) this.u8(c.charCodeAt(0)); return this; }
    raw(bytes) { this.bytes.push(...bytes); return this; }
    pad() { while (this.bytes.length % 4) this.u8(0); return this; }
    get length() { return this.bytes.length; }
}

/** @param {number[]} bytes */
function checksum(bytes) {
    let sum = 0;
    for (let i = 0; i < bytes.length; i += 4) sum = (sum + ((bytes[i] << 24) >>> 0) + ((bytes[i + 1] ?? 0) << 16) + ((bytes[i + 2] ?? 0) << 8) + (bytes[i + 3] ?? 0)) >>> 0;
    return sum;
}

/** The outline of a simple glyph: one contour of points on the curve. @param {[number, number][]} points */
function glyph(points) {
    const w = new Writer();
    if (!points.length) return w;
    const xs = points.map(p => p[0]);
    const ys = points.map(p => p[1]);
    w.i16(1).i16(Math.min(...xs)).i16(Math.min(...ys)).i16(Math.max(...xs)).i16(Math.max(...ys));
    w.u16(points.length - 1).u16(0);
    for (let i = 0; i < points.length; i++) w.u8(1);
    let previous = 0;
    for (const x of xs) { w.i16(x - previous); previous = x; }
    previous = 0;
    for (const y of ys) { w.i16(y - previous); previous = y; }
    return w;
}

function build() {
    const right = clockwise(polygonOf(SOURCE));
    // .notdef (empty), then each symbol with its code point
    const symbols = [
        { code: 0x2192, points: right },
        { code: 0x2191, points: clockwise(turned(right, 1)) },
        { code: 0x2190, points: clockwise(turned(right, 2)) },
        { code: 0x2193, points: clockwise(turned(right, 3)) }
    ];
    const outlines = [glyph([]), ...symbols.map(s => glyph(s.points))];
    const all = symbols.flatMap(s => s.points);
    const bbox = [Math.min(...all.map(p => p[0])), Math.min(...all.map(p => p[1])), Math.max(...all.map(p => p[0])), Math.max(...all.map(p => p[1]))];
    const numGlyphs = outlines.length;
    const tables = {};

    // glyf and loca (long offsets)
    const glyf = new Writer();
    const loca = new Writer();
    for (const outline of outlines) {
        loca.u32(glyf.length);
        glyf.raw(outline.bytes);
        while (glyf.length % 4) glyf.u8(0);
    }
    loca.u32(glyf.length);
    tables.glyf = glyf;
    tables.loca = loca;

    tables.head = new Writer().u32(0x00010000).u32(0x00010000).u32(0).u32(0x5f0f3cf5).u16(0x000b).u16(UNITS_PER_EM)
        .u32(0).u32(0).u32(0).u32(0).i16(bbox[0]).i16(bbox[1]).i16(bbox[2]).i16(bbox[3]).u16(0).u16(8).i16(2).i16(1).i16(0);

    tables.hhea = new Writer().u32(0x00010000).i16(ASCENDER).i16(DESCENDER).i16(0).u16(ADVANCE).i16(bbox[0]).i16(ADVANCE - bbox[2]).i16(bbox[2])
        .i16(1).i16(0).i16(0).i16(0).i16(0).i16(0).i16(0).i16(0).u16(numGlyphs);

    const hmtx = new Writer();
    for (const [index, outline] of outlines.entries()) hmtx.u16(index ? ADVANCE : 500).i16(outline.length ? Math.min(...symbols[index - 1].points.map(p => p[0])) : 0);
    tables.hmtx = hmtx;

    const maxPoints = Math.max(...symbols.map(s => s.points.length));
    tables.maxp = new Writer().u32(0x00010000).u16(numGlyphs).u16(maxPoints).u16(1).u16(0).u16(0).u16(2).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0);

    // cmap: format 4, a segment for each symbol, then the final one
    const sorted = symbols.map((s, i) => ({ code: s.code, glyph: i + 1 })).sort((a, b) => a.code - b.code);
    const segments = [...sorted.map(s => ({ start: s.code, end: s.code, delta: (s.glyph - s.code + 65536) % 65536 })), { start: 0xffff, end: 0xffff, delta: 1 }];
    const segX2 = segments.length * 2;
    const searchRange = 2 * 2 ** Math.floor(Math.log2(segments.length));
    const sub = new Writer().u16(4).u16(16 + segments.length * 8).u16(0).u16(segX2).u16(searchRange).u16(Math.log2(searchRange / 2)).u16(segX2 - searchRange);
    segments.forEach(s => sub.u16(s.end));
    sub.u16(0);
    segments.forEach(s => sub.u16(s.start));
    segments.forEach(s => sub.u16(s.delta));
    segments.forEach(() => sub.u16(0));
    tables.cmap = new Writer().u16(0).u16(1).u16(3).u16(1).u32(12).raw(sub.bytes);

    tables['OS/2'] = new Writer().u16(4).i16(ADVANCE).u16(400).u16(5).u16(0)
        .i16(650).i16(700).i16(0).i16(140).i16(650).i16(700).i16(0).i16(480).i16(50).i16(258).i16(0)
        .raw([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]).u32(0).u32(0).u32(0).u32(0).tag('DDB ').u16(0x0040)
        .u16(sorted[0].code).u16(sorted.at(-1).code).i16(ASCENDER).i16(DESCENDER).i16(0).u16(ASCENDER).u16(-DESCENDER)
        .u32(1).u32(0).i16(528).i16(711).u16(0).u16(32).u16(1);

    const names = [[1, 'ReportSymbols'], [2, 'Regular'], [4, 'ReportSymbols Regular'], [6, 'ReportSymbols-Regular']];
    const strings = names.map(([, text]) => [...text].flatMap(c => [0, c.charCodeAt(0)]));
    const name = new Writer().u16(0).u16(names.length).u16(6 + names.length * 12);
    let offset = 0;
    names.forEach(([id], i) => { name.u16(3).u16(1).u16(0x409).u16(id).u16(strings[i].length).u16(offset); offset += strings[i].length; });
    strings.forEach(s => name.raw(s));
    tables.name = name;

    tables.post = new Writer().u32(0x00030000).u32(0).i16(-100).i16(50).u32(0).u32(0).u32(0).u32(0).u32(0);

    // The table directory, the tables in the order of their tags, then the checksum of the whole font
    const tags = Object.keys(tables).sort();
    const font = new Writer();
    const entrySelector = Math.floor(Math.log2(tags.length));
    font.u32(0x00010000).u16(tags.length).u16(16 * 2 ** entrySelector).u16(entrySelector).u16(tags.length * 16 - 16 * 2 ** entrySelector);
    let position = 12 + tags.length * 16;
    const directory = [];
    for (const tag of tags) {
        const bytes = tables[tag].bytes;
        directory.push({ tag, sum: checksum(bytes), offset: position, length: bytes.length });
        position += Math.ceil(bytes.length / 4) * 4;
    }
    for (const entry of directory) font.tag(entry.tag).u32(entry.sum).u32(entry.offset).u32(entry.length);
    for (const tag of tags) font.raw(tables[tag].bytes).pad();
    const adjustment = (0xb1b0afba - checksum(font.bytes) + 2 ** 32) % 2 ** 32;
    const head = directory.find(e => e.tag === 'head');
    const at = head.offset + 8;
    font.bytes.splice(at, 4, (adjustment >>> 24) & 255, (adjustment >>> 16) & 255, (adjustment >>> 8) & 255, adjustment & 255);
    return { bytes: Buffer.from(font.bytes), codes: symbols.map(s => s.code) };
}

const { bytes, codes } = build();
fs.writeFileSync(OUTPUT, `// @ts-check
// Generated by scripts/build_report_symbols.mjs from webapp/fonts/report-symbols: do not edit.
/** The font of the symbols that Roboto has no glyph for, as pdfmake takes a file of its virtual file system (base64). */
export const REPORT_SYMBOLS_FONT = '${bytes.toString('base64')}';
/** The characters it has a glyph for. */
export const REPORT_SYMBOLS = Object.freeze(${JSON.stringify(codes.map(c => String.fromCodePoint(c)))});
`);
console.log(`${OUTPUT}: ${bytes.length} bytes, ${codes.length} symbols`);
