// @ts-check
/**
 * The blocks of the report model as PDF content. Every text is the model's string, written as it is (the model has
 * already formatted the numbers, the dates and the units): this file chooses where it goes on the page and how it looks,
 * and nothing else, so the page and the PDF cannot differ in what they say.
 *
 * Content is pdfmake document-definition nodes: plain data, with no DOM and no PDF library loaded.
 */
import { markdownToPdf } from '@/libs/reports/pdf/pdfMarkdown';
import { figureBox } from '@/libs/reports/pdf/pdfLayout';
import { INK, MUTED, RULE, SUBTLE, TRACK, WHITE, INFO_FILL, WARNING_FILL, tint, textOn, toneColour } from '@/libs/reports/pdf/pdfTheme';
import { softBadge } from '@/libs/reports/reportStyling';
import { donutSvg } from '@/libs/reports/donutChart';
import { qrSvg } from '@/libs/qr';
import { isOriginUrl } from '@/libs/originUrl';
import { MISSING_PHOTO, figureCaption } from '@/libs/reports/reportSections';
import { pdfText } from '@/libs/reports/pdf/pdfText';

export { INK, MUTED };

/** The side of a QR code on the page, in points */
const QR_POINTS = 76;
const PHOTO_GAP = 10;
/** The most photos in a row, by the orientation of the page */
export const PHOTOS_PER_ROW = Object.freeze({ portrait: 3, landscape: 6 });
/** The gap between two tiles of a row, in points */
const TILE_GAP = 8;

/**
 * @typedef {object} BlockContext
 * @property {import('./pdfLayout').PageLayout} layout
 * @property {import('./pdfAssets').PdfAssets} assets  the images that were prepared
 * @property {(text: string) => { size: number, path: string }} qr  the QR encoder
 * @property {string} origin  of the Hub: a QR code is made only for an address on it
 * @property {{ primary: string, accent: string }} colours  of the template
 * @property {{ kind: string }} section  the section the block is in
 * @property {any | null} previous  the block before this one in its section
 * @property {Set<string>} destinations  the anchors that an item page of the report has
 * @property {Set<string>} used  the anchors given to a heading so far (a destination is named once)
 */

/** A text that is the model's, in the style named. @param {string} text @param {string} style */
export const line = (text, style) => ({ text, style });

/** No lines and no padding: a table used to place things, not to draw a grid */
const PLAIN = Object.freeze({
    hLineWidth: () => 0, vLineWidth: () => 0,
    paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0
});

/**
 * A badge: its text on a light fill of its colour, in its colour (white on its colour for a strong one).
 * @param {{ label: string, colour: string, tone?: string }} badge @param {number} [fontSize]
 */
export function badgeText(badge, fontSize = 8) {
    const strong = badge.tone === 'alert';
    const soft = softBadge(badge.colour);
    return {
        text: `\u00a0${badge.label}\u00a0`,
        background: strong ? badge.colour : soft.fill,
        color: strong ? WHITE : soft.text,
        bold: true,
        fontSize
    };
}

/** The badges of an item on one line, a space between two. @param {any[]} badges @param {number} [fontSize] */
export function badgeLine(badges, fontSize = 8) {
    return { text: badges.flatMap((/** @type {any} */ b, /** @type {number} */ i) => [...(i ? [{ text: '  ', fontSize }] : []), badgeText(b, fontSize)]), lineHeight: 1.4 };
}

/**
 * The figure of an image that was prepared: the image in its box, then its caption (what it shows, the note of the
 * model and the note of the renderer).
 * @param {any} block
 * @param {{ image: import('./pdfAssets').PreparedImage | null, note: string | null } | undefined} made
 * @param {{ widthPt: number, heightPt: number }} box
 * @param {string} alt  what it shows
 */
export function figure(block, made, box, alt) {
    const image = made?.image ?? null;
    return {
        stack: [
            ...(image ? [{
                table: { widths: ['auto'], body: [[{ image: image.dataUrl, fit: [box.widthPt, box.heightPt] }]] },
                layout: { hLineWidth: () => 0.6, vLineWidth: () => 0.6, hLineColor: () => RULE, vLineColor: () => RULE, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 }
            }] : [{ text: '', margin: [0, 2, 0, 0] }]),
            line(figureCaption(alt, block.note, made?.note), 'caption')
        ],
        unbreakable: true,
        margin: [0, 0, 0, 8]
    };
}

/**
 * The figure of a block that is an image (a map, a 3D capture, a chart), in its box.
 * @param {any} block @param {BlockContext} ctx
 * @param {{ maxHeight?: number, maxWidth?: number }} [options]  the room the image has on its page (its column), in points
 */
export function figureOf(block, ctx, { maxHeight = Infinity, maxWidth = Infinity } = {}) {
    const alt = block.type === 'capture3d' ? block.text : block.alt;
    const box = figureBox(ctx.layout, block);
    const scale = Math.min(1, Math.max(0.2, Math.min(maxHeight / box.heightPt, maxWidth / box.widthPt)));
    const node = figure(block, ctx.assets.figures.get(block), { widthPt: box.widthPt * scale, heightPt: box.heightPt * scale }, alt);
    // The legend of a map stays with it
    if (block.type === 'mapSnapshot') node.stack.push(...legendNodes(block.legend));
    return [node];
}

/** @param {{ id: string | null, name: string, colour: string }[]} legend @returns {any[]} */
function legendNodes(legend) {
    if (!legend?.length) return [];
    return [{
        text: legend.flatMap((entry, i) => [
            ...(i ? [{ text: '    ' }] : []),
            { text: '■ ', color: entry.colour, fontSize: 11 },
            { text: entry.name, color: INK }
        ]),
        fontSize: 8,
        margin: [0, 0, 0, 10]
    }];
}

/**
 * The title of a section: its name in the primary colour over a short bar of the accent colour.
 * @param {any} block @param {BlockContext} ctx
 */
function sectionTitle(block, ctx) {
    return {
        stack: [
            { text: block.text, style: 'h1', tocItem: true, tocStyle: { bold: true, fontSize: 10.5 }, tocMargin: [0, 6, 0, 0] },
            { canvas: [{ type: 'rect', x: 0, y: 0, w: 46, h: 3, color: ctx.colours.accent }], margin: [0, 0, 0, 14] }
        ]
    };
}

/** @param {any} block @param {BlockContext} ctx */
function heading(block, ctx) {
    if (ctx.section.kind === 'cover') return line(block.text, block.level === 1 ? 'coverTitle' : 'coverSubtitle');
    if (block.level === 1) return sectionTitle(block, ctx);
    const node = /** @type {Record<string, any>} */ (line(block.text, block.level === 2 ? 'h2' : 'h3'));
    if (block.anchor && !ctx.used.has(block.anchor)) {
        ctx.used.add(block.anchor);
        node.id = block.anchor;
    }
    return node;
}

/** @param {{ label: string, value: string }[]} rows @param {number} [labelWidth] */
export function keyValue(rows, labelWidth = 110) {
    return {
        table: { widths: [labelWidth, '*'], body: rows.map(row => [{ text: row.label, color: MUTED, fontSize: 8.5 }, { text: row.value, fontSize: 9.5, bold: true }]) },
        layout: {
            hLineWidth: (/** @type {number} */ i, /** @type {any} */ node) => (i === 0 || i === node.table.body.length ? 0 : 0.5),
            vLineWidth: () => 0, hLineColor: () => TRACK,
            paddingLeft: () => 0, paddingRight: () => 6, paddingTop: () => 3.5, paddingBottom: () => 3.5
        },
        margin: [0, 0, 0, 10]
    };
}

/**
 * Tiles in a row: each a light fill with a bar of its colour on top. A row has `perRow` tiles at most; the last row
 * keeps the width of a tile.
 * @param {{ colour: string, stack: any[] }[]} tiles @param {number} perRow @param {number} contentWidth
 */
export function tileRows(tiles, perRow, contentWidth) {
    const width = (contentWidth - TILE_GAP * (perRow - 1)) / perRow;
    /** @type {any[]} */
    const rows = [];
    for (let i = 0; i < tiles.length; i += perRow) {
        rows.push({
            columns: tiles.slice(i, i + perRow).map(tile => ({
                width,
                table: {
                    widths: ['*'],
                    body: [
                        [{ text: '', fillColor: tile.colour, margin: [0, 1.5, 0, 0] }],
                        [{ stack: tile.stack, fillColor: tint(tile.colour, 0.92), margin: [9, 7, 9, 8] }]
                    ]
                },
                layout: PLAIN
            })),
            columnGap: TILE_GAP,
            margin: [0, 0, 0, TILE_GAP],
            unbreakable: true
        });
    }
    return rows;
}

/**
 * The headline figures as tiles: the number large in the colour of its tone, its name and what it means under it.
 * @param {any} block @param {BlockContext} ctx @param {{ perRow?: number, width?: number }} [options]
 */
export function kpiTiles(block, ctx, { perRow, width } = {}) {
    const tiles = block.tiles.map((/** @type {any} */ kpi) => {
        const colour = toneColour(kpi.tone, ctx.colours);
        return {
            colour,
            stack: [
                { text: kpi.value, fontSize: 22, bold: true, color: colour, lineHeight: 1 },
                { text: kpi.label, fontSize: 8, bold: true, color: INK, characterSpacing: 0.3, margin: [0, 3, 0, 0] },
                { text: kpi.detail, fontSize: 7.5, color: MUTED }
            ]
        };
    });
    return tileRows(tiles, perRow ?? tiles.length, width ?? ctx.layout.contentWidth);
}

/** The columns of a table whose cells stay on one line */
const NEVER_WRAPPED = new Set(['ref', 'type']);
/** The column of a table that takes the width the others leave */
const REST_COLUMN = 'name';

/** A word of a text with the places after it where a line may break: spaces, zero-width spaces, hyphens, slashes */
const WORD = /[^ \u200b\-/]+[ \u200b\-/]*|[ \u200b\-/]+/g;

/**
 * A text as one run for each word, which the library never cuts. The column that takes the rest of the width is never
 * narrower than its widest word, but the library finds that width by subtractions, which can leave it a rounding error
 * short, and it then cuts the word in two ("Nam" over "e"). A run that does not wrap is never cut, and a line still
 * breaks between two runs. The text is the font's first (pdfText), so that a long run of characters with no break has its
 * break opportunities before it becomes runs; a text of several lines stays as it is.
 * @param {string} text
 * @returns {string | { text: string, noWrap: true }[]}
 */
function uncutWords(text) {
    if (text.includes('\n')) return text;
    const words = pdfText(text).match(WORD);
    return words ? words.map(word => ({ text: word, noWrap: true })) : text;
}

/** A sign between two digits of a figure: a group separator or the decimal sign */
const BETWEEN_DIGITS = /(\p{Nd})(\P{Nd})(?=\p{Nd})/gu;
/** A space after a digit: the one between a figure and its unit */
const DIGIT_SPACE = /(\p{Nd}) /gu;

/**
 * A figure that may also wrap between its groups of digits: a zero-width space after each group separator. The group
 * separator is the sign that the figure has between digits twice or more (the decimal sign is there once at most), so
 * a figure in the millions or more gets the breaks, in the separator of any locale (",", ".", a no-break space, an
 * apostrophe), and a smaller one, which fits its column, stays as it is.
 * @param {string} text
 */
function breakableFigure(text) {
    /** @type {Map<string, number>} */
    const counts = new Map();
    for (const [, , sign] of text.matchAll(BETWEEN_DIGITS)) counts.set(sign, (counts.get(sign) ?? 0) + 1);
    const groups = new Set([...counts].filter(([, count]) => count > 1).map(([sign]) => sign));
    if (!groups.size) return text;
    // The unit stays with the last group: a second line of "567.89 m³" rather than a third of "m³" alone
    return text.replace(BETWEEN_DIGITS, (match, digit, sign) => (groups.has(sign) ? `${digit}${sign}\u200b` : match)).replace(DIGIT_SPACE, '$1\u00a0');
}

/** @param {any} block @param {BlockContext} ctx */
function table(block, ctx) {
    const align = (/** @type {string} */ a) => (a === 'right' ? 'right' : 'left');
    const portrait = ctx.layout.pageOrientation === 'portrait';
    const header = block.columns.map((/** @type {any} */ c) => ({ text: c.key === REST_COLUMN ? uncutWords(c.label) : c.label, style: 'tableHeader', color: textOn(ctx.colours.primary), alignment: align(c.align) }));
    const body = block.rows.map((/** @type {any} */ row) => block.columns.map((/** @type {any} */ column, /** @type {number} */ index) => {
        const value = row.cells[column.key] ?? '';
        // A figure of a portrait page may wrap between its groups of digits too: five figures in the millions and the
        // columns beside them are wider than the page, though each would fit with its unit on a second line
        const text = portrait && column.align === 'right' ? breakableFigure(value) : value;
        const note = row.note && column.key === 'name' ? ` (${row.note})` : '';
        const written = `${text}${note}`;
        const cell = /** @type {Record<string, any>} */ ({ text: column.key === REST_COLUMN ? uncutWords(written) : written, style: 'tableCell', alignment: align(column.align) });
        // A reference and a type stay on one line (they are short); every other cell wraps where its text can break, so that
        // a long name, material or status never pushes the last column off the page, and a figure goes to a second line at
        // its unit when the page is narrow
        if (NEVER_WRAPPED.has(column.key)) cell.noWrap = true;
        const marks = row.marks;
        // A category or severity has a square of its colour; a status is written in its colour, red when overdue
        if (marks && (column.key === 'category' || column.key === 'severity') && marks[column.key]) {
            cell.text = [{ text: '■ ', color: marks[column.key] }, { text }];
        } else if (marks && column.key === 'status' && marks.status) {
            Object.assign(cell, { color: marks.overdue ? '#dc2626' : marks.status, bold: true });
        }
        // The first column names the row: it jumps to the page of the item when the report has one
        const destination = row.anchor ? String(row.anchor).replace(/^#/, '') : '';
        if (index === 0) Object.assign(cell, { bold: true });
        if (index === 0 && destination && ctx.destinations.has(destination)) Object.assign(cell, { linkToDestination: destination, color: ctx.colours.primary });
        return cell;
    }));
    return [
        { text: block.title, style: 'tableTitle', color: ctx.colours.primary },
        {
            table: { headerRows: 1, dontBreakRows: true, widths: block.columns.map((/** @type {any} */ c) => (c.key === REST_COLUMN ? '*' : 'auto')), body: [header, ...body] },
            layout: {
                hLineWidth: (/** @type {number} */ i, /** @type {any} */ node) => (i === 0 || i === 1 || i === node.table.body.length ? 0 : 0.5),
                vLineWidth: () => 0,
                hLineColor: () => TRACK,
                fillColor: (/** @type {number} */ row) => (row === 0 ? ctx.colours.primary : row % 2 === 0 ? SUBTLE : null),
                paddingLeft: () => 5, paddingRight: () => 5, paddingTop: () => 4, paddingBottom: () => 4
            },
            margin: [0, 0, 0, 14]
        }
    ];
}

/**
 * A count as a bar: its name, a bar of its colour on a grey track as long as the count is of the largest, the count.
 * @param {{ label: string, count: number, colour?: string }} count @param {number} max @param {number} track  the length of the track
 */
function barRow(count, max, track) {
    const length = max ? Math.max(2, (count.count / max) * track) : 0;
    return [
        { text: count.label, fontSize: 8.5, color: INK, margin: [0, 1, 4, 0] },
        { canvas: [{ type: 'rect', x: 0, y: 3, w: track, h: 7, r: 3.5, color: TRACK }, { type: 'rect', x: 0, y: 3, w: length, h: 7, r: 3.5, color: count.colour || MUTED }] },
        { text: String(count.count), fontSize: 8.5, bold: true, alignment: 'right', margin: [0, 1, 0, 0] }
    ];
}

/** The side of the donut of a group of counts, in points */
const DONUT_SIDE = 74;

/**
 * A group of counts as bars, one per count, as long as the count is of the largest of the group.
 * @param {any} group @param {number} columnWidth
 */
function barGroup(group, columnWidth) {
    const labelWidth = Math.min(110, columnWidth * 0.42);
    const track = Math.max(20, columnWidth - labelWidth - 26 - 8);
    const max = Math.max(...group.counts.map((/** @type {any} */ c) => c.count), 0);
    return { table: { widths: [labelWidth, track, 22], body: group.counts.map((/** @type {any} */ c) => barRow(c, max, track)) }, layout: PLAIN };
}

/**
 * A group of counts as a donut (the ring of the live page) with a legend beside it: the colour, the name, the count and
 * its share of the group.
 * @param {any} group
 */
function donutGroup(group) {
    const legend = group.counts.map((/** @type {any} */ c) => [
        { canvas: [{ type: 'rect', x: 0, y: 2.5, w: 7, h: 7, r: 2, color: c.colour || MUTED }] },
        { text: c.label, fontSize: 8.5, color: INK, margin: [0, 1, 2, 0] },
        { text: String(c.count), fontSize: 8.5, bold: true, alignment: 'right', margin: [0, 1, 0, 0] },
        { text: c.share, fontSize: 8, color: MUTED, alignment: 'right', margin: [0, 1.5, 0, 0] }
    ]);
    return {
        columns: [
            { svg: donutSvg(group.counts, group.middle, { background: WHITE, ink: INK, muted: MUTED }), width: DONUT_SIDE },
            { table: { widths: [11, '*', 18, 26], body: legend }, layout: PLAIN, width: '*', margin: [0, Math.max(0, (DONUT_SIDE - legend.length * 13) / 2), 0, 0] }
        ],
        columnGap: 10
    };
}

/** The summary: the totals as tiles, then the counts as bars or donuts (the template's choice). @param {any} block @param {BlockContext} ctx */
function summaryStats(block, ctx) {
    const landscape = ctx.layout.pageOrientation === 'landscape';
    const donuts = block.chart === 'donuts';
    const totals = block.totals.map((/** @type {any} */ total) => ({
        colour: ctx.colours.accent,
        stack: [
            { text: total.label, fontSize: 8, bold: true, color: MUTED, characterSpacing: 0.3 },
            { text: total.text, fontSize: 14, bold: true, color: INK, margin: [0, 2, 0, 0] },
            ...(total.partsText ? [{ text: total.partsText, fontSize: 7.5, color: MUTED }] : [])
        ]
    }));
    // A donut and its legend need more width than a column of bars: three in a landscape row, not four
    const perRow = landscape ? (donuts ? 3 : 4) : 2;
    const columnWidth = (ctx.layout.contentWidth - 18 * (perRow - 1)) / perRow;
    const groups = block.groups.map((/** @type {any} */ group) => ({
        width: columnWidth,
        stack: [
            { text: group.title, bold: true, fontSize: 10, color: ctx.colours.primary, margin: [0, 0, 0, 5] },
            donuts ? donutGroup(group) : barGroup(group, columnWidth)
        ],
        unbreakable: true
    }));
    /** @type {any[]} */
    const rows = [];
    for (let i = 0; i < groups.length; i += perRow) rows.push({ columns: groups.slice(i, i + perRow), columnGap: 18, margin: [0, 0, 0, 16] });
    return [
        { text: block.headline, bold: true, fontSize: 10.5, margin: [0, 0, 0, 8] },
        ...(totals.length ? [{ text: 'Totals', style: 'tableTitle', color: ctx.colours.primary }, ...tileRows(totals, landscape ? Math.min(5, totals.length) : Math.min(3, totals.length), ctx.layout.contentWidth)] : []),
        ...(rows.length ? [{ text: 'Breakdown', style: 'tableTitle', color: ctx.colours.primary, margin: [0, 8, 0, 8] }, ...rows] : [])
    ];
}

/**
 * The photos of an item in rows, each with its caption.
 * @param {any} block @param {BlockContext} ctx @param {{ perRow?: number, width?: number }} [options]
 */
export function photoGrid(block, ctx, { perRow = PHOTOS_PER_ROW[ctx.layout.pageOrientation], width: available = ctx.layout.contentWidth } = {}) {
    const width = (available - PHOTO_GAP * (perRow - 1)) / perRow;
    const cells = block.photos.map((/** @type {any} */ photo) => {
        const image = ctx.assets.photos.get(photo.path) ?? null;
        return {
            stack: [
                image
                    ? { image: image.dataUrl, fit: [width, width * 0.75] }
                    // A photo the dataset no longer has (or one that could not be read) is said, with its path
                    : { text: [{ text: `${MISSING_PHOTO}\n`, bold: true }, { text: photo.path, fontSize: 8, color: MUTED }], fontSize: 9, margin: [0, 6, 0, 6] },
                ...(photo.caption ? [{ text: photo.caption, style: 'caption' }] : [])
            ],
            unbreakable: true,
            width
        };
    });
    /** @type {any[]} */
    const rows = [];
    for (let i = 0; i < cells.length; i += perRow) {
        const row = cells.slice(i, i + perRow);
        // The last row keeps the width of a cell: the columns do not stretch to fill it
        rows.push({ columns: row, columnGap: PHOTO_GAP, margin: [0, 0, 0, 6] });
    }
    return rows;
}

/**
 * The QR code of an address, or null when it has none: an address of another site has no code, and one too long for a
 * code (the encoder gives up past its capacity) has none either, as on the live page: its address is written out.
 * @param {{ qr: BlockContext['qr'], origin: string }} ctx @param {string} url
 * @returns {{ size: number, path: string } | null}
 */
export function qrCodeOf(ctx, url) {
    if (!isOriginUrl(url, ctx.origin)) return null;
    try {
        return ctx.qr(url);
    } catch (e) {
        console.warn('The QR code could not be made:', e);
        return null;
    }
}

/**
 * The QR code of an address of the Hub, with its label and the address; a code is made only for this Hub.
 * @param {any} block @param {BlockContext} ctx @param {number} [side]  of the code, in points
 */
export function qr(block, ctx, side = QR_POINTS) {
    const label = { text: block.label, bold: true, fontSize: 9 };
    // Only the address of this Hub gets a code: a report cannot print a code for another site
    const code = qrCodeOf(ctx, block.url);
    if (!code) return [{ stack: [label, { text: block.url, fontSize: 8, color: MUTED }], margin: [0, 0, 0, 8] }];
    return [{
        columns: [
            { svg: qrSvg(code, side), width: side },
            { stack: [label, { text: block.url, fontSize: 7.5, color: MUTED, link: block.url, margin: [0, 2, 0, 0] }], margin: [10, 4, 0, 0] }
        ],
        unbreakable: true,
        margin: [0, 4, 0, 8]
    }];
}

/** @param {any} block */
function note(block) {
    return {
        table: { widths: ['*'], body: [[{ text: block.text, fontSize: 9.5, color: INK, fillColor: block.tone === 'warning' ? WARNING_FILL : INFO_FILL, margin: [6, 4, 6, 4] }]] },
        layout: 'noBorders',
        margin: [0, 0, 0, 8],
        unbreakable: true
    };
}

/**
 * A text in a box with a bar of a colour on its left: a description, the disclaimer.
 * @param {any[]} content @param {string} colour
 */
export function callout(content, colour) {
    return {
        table: { widths: ['*'], body: [[{ stack: content, fillColor: SUBTLE, margin: [10, 7, 10, 3] }]] },
        layout: {
            hLineWidth: () => 0, vLineWidth: (/** @type {number} */ i) => (i === 0 ? 3 : 0), vLineColor: () => colour,
            paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0
        },
        margin: [0, 2, 0, 10]
    };
}

/** @param {any} block @param {BlockContext} ctx */
function signOff(block, ctx) {
    return [
        ...(block.byline ? [{ text: block.byline, bold: true, margin: [0, 6, 0, 10] }] : []),
        {
            columns: block.lines.map((/** @type {{ label: string }} */ entry) => ({
                table: { widths: ['*'], body: [[{ text: '', margin: [0, 26, 0, 0] }], [{ text: entry.label, fontSize: 8, bold: true, color: MUTED, characterSpacing: 0.3 }]] },
                layout: {
                    hLineWidth: (/** @type {number} */ i) => (i === 1 ? 0.8 : 0), vLineWidth: () => 0, hLineColor: () => ctx.colours.primary,
                    paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 3, paddingBottom: () => 0
                }
            })),
            columnGap: 24,
            unbreakable: true
        }
    ];
}

/**
 * The content of one block of the model.
 * @param {any} block
 * @param {BlockContext} ctx
 * @returns {any[]}  nodes (a block can make several); none for a type this renderer does not know
 */
export function blockNodes(block, ctx) {
    switch (block.type) {
        // The logo the assets prepared from the model's (the one of the header); none when it could not be read
        case 'logo': return ctx.assets.logo ? [{ image: ctx.assets.logo.dataUrl, fit: [180, 60], margin: [0, 20, 0, 0] }] : [];
        case 'heading': return [heading(block, ctx)];
        case 'keyValue': return [keyValue(block.rows)];
        case 'kpis': return kpiTiles(block, ctx);
        case 'table': return table(block, ctx);
        case 'markdown': return markdownToPdf(block.text, { link: ctx.colours.accent });
        case 'note': return [note(block)];
        case 'signOff': return signOff(block, ctx);
        case 'summaryStats': return summaryStats(block, ctx);
        case 'photoGrid': return photoGrid(block, ctx);
        case 'qr': return qr(block, ctx);
        // A 3D capture with none says so ("No 3D snapshot"); one that could not be read, the note says why
        case 'mapSnapshot':
        case 'chart':
        case 'capture3d': return figureOf(block, ctx);
        default: return [];
    }
}
