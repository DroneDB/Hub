// @ts-check
/**
 * The blocks of the report model as PDF content. Every text is the model's string, written as it is (the model has
 * already formatted the numbers, the dates and the units): this file chooses where it goes on the page, and nothing
 * else, so the page and the PDF cannot differ in what they say.
 *
 * Content is pdfmake document-definition nodes: plain data, with no DOM and no PDF library loaded.
 */
import { markdownToPdf } from '@/libs/reports/pdf/pdfMarkdown';
import { figureBox } from '@/libs/reports/pdf/pdfLayout';
import { qrSvg } from '@/libs/qr';
import { isOriginUrl } from '@/libs/originUrl';
import { MISSING_PHOTO, figureCaption } from '@/libs/reports/reportSections';

export const INK = '#1f2937';
export const MUTED = '#64748b';
const RULE = '#cbd5e1';
const HEADER_FILL = '#f1f5f9';
const INFO_FILL = '#e0f2fe';
// The yellow of a warning, with dark text
const WARNING_FILL = '#fef08a';
/** The box of the logo on the cover, in points */
const COVER_LOGO = Object.freeze({ width: 180, height: 60 });
/** The side of a QR code on the page, in points */
const QR_POINTS = 76;
const PHOTO_GAP = 10;
/** The most photos in a row, by the orientation of the page */
const PHOTOS_PER_ROW = Object.freeze({ portrait: 2, landscape: 3 });

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
const line = (text, style) => ({ text, style });

/**
 * The figure of an image that was prepared: the image in its box, then its caption (what it shows, the note of the
 * model and the note of the renderer).
 * @param {any} block
 * @param {{ image: import('./pdfAssets').PreparedImage | null, note: string | null } | undefined} made
 * @param {{ widthPt: number, heightPt: number }} box
 * @param {string} alt  what it shows
 */
function figure(block, made, box, alt) {
    const image = made?.image ?? null;
    return {
        stack: [
            ...(image ? [{ image: image.dataUrl, fit: [box.widthPt, box.heightPt], alignment: 'left' }] : []),
            line(figureCaption(alt, block.note, made?.note), 'caption')
        ],
        unbreakable: true,
        margin: [0, 0, 0, 8]
    };
}

/** @param {{ id: string | null, name: string, colour: string }[]} legend @returns {any[]} */
function legendNodes(legend) {
    if (!legend?.length) return [];
    return [{
        columns: legend.flatMap(entry => [
            { canvas: [{ type: 'rect', x: 0, y: 2, w: 8, h: 8, color: entry.colour }], width: 12 },
            { text: entry.name, width: 'auto', fontSize: 8, margin: [0, 0, 10, 0] }
        ]),
        columnGap: 0,
        margin: [0, 0, 0, 8]
    }];
}

/** @param {any} block @param {BlockContext} ctx */
function heading(block, ctx) {
    if (ctx.section.kind === 'cover') return line(block.text, block.level === 1 ? 'coverTitle' : 'coverSubtitle');
    if (block.level === 1) return { ...line(block.text, 'h1'), tocItem: true, tocStyle: { bold: true, fontSize: 10.5 }, tocMargin: [0, 6, 0, 0] };
    const node = /** @type {Record<string, any>} */ (line(block.text, block.level === 2 ? 'h2' : 'h3'));
    if (block.anchor && !ctx.used.has(block.anchor)) {
        ctx.used.add(block.anchor);
        node.id = block.anchor;
    }
    if (block.itemId) {
        // Each item has a page of its own, unless it follows the heading of its section on the page it is on
        const first = ctx.previous?.type === 'heading' && ctx.previous.level === 1;
        Object.assign(node, { tocItem: true, tocStyle: { fontSize: 9 }, tocMargin: [14, 0, 0, 0], ...(first ? {} : { pageBreak: 'before' }) });
    }
    return node;
}

/** @param {{ label: string, value: string }[]} rows */
function keyValue(rows) {
    return {
        table: { widths: [110, '*'], body: rows.map(row => [{ text: row.label, color: MUTED, fontSize: 9 }, { text: row.value, fontSize: 9.5 }]) },
        layout: 'noBorders',
        margin: [0, 0, 0, 8]
    };
}

/** @param {any} block @param {BlockContext} ctx */
function table(block, ctx) {
    const align = (/** @type {string} */ a) => (a === 'right' ? 'right' : 'left');
    const header = block.columns.map((/** @type {any} */ c) => ({ text: c.label, style: 'tableHeader', alignment: align(c.align) }));
    const body = block.rows.map((/** @type {any} */ row) => block.columns.map((/** @type {any} */ column, /** @type {number} */ index) => {
        const text = row.cells[column.key] ?? '';
        const note = row.note && column.key === 'name' ? ` (${row.note})` : '';
        const cell = /** @type {Record<string, any>} */ ({ text: `${text}${note}`, style: 'tableCell', alignment: align(column.align) });
        // The first column names the row: it jumps to the page of the item when the report has one
        const destination = row.anchor ? String(row.anchor).replace(/^#/, '') : '';
        if (index === 0 && destination && ctx.destinations.has(destination)) Object.assign(cell, { linkToDestination: destination, color: ctx.colours.primary });
        return cell;
    }));
    return [
        { ...line(block.title, 'tableTitle') },
        {
            table: { headerRows: 1, dontBreakRows: true, widths: block.columns.map(() => 'auto'), body: [header, ...body] },
            layout: {
                hLineWidth: (/** @type {number} */ i, /** @type {any} */ node) => (i === 0 || i === node.table.body.length ? 0 : 0.5),
                vLineWidth: () => 0,
                hLineColor: () => RULE,
                fillColor: (/** @type {number} */ row) => (row === 0 ? HEADER_FILL : null),
                paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 3, paddingBottom: () => 3
            },
            margin: [0, 0, 0, 10]
        }
    ];
}

/** The summary: the counts and totals, with the texts of the model. @param {any} block */
function summaryStats(block) {
    return [
        { text: block.headline, bold: true, margin: [0, 0, 0, 6] },
        ...(block.totals.length ? [keyValue(block.totals.map((/** @type {any} */ total) => ({
            label: total.label,
            value: total.partsText ? `${total.text} (${total.partsText})` : total.text
        })))] : []),
        ...(block.groups.length ? [{
            columns: block.groups.map((/** @type {any} */ group) => ({
                stack: [{ text: group.title, bold: true, fontSize: 9.5, margin: [0, 0, 0, 3] }, { ul: group.counts.map((/** @type {any} */ count) => ({ text: `${count.label}: ${count.count}`, fontSize: 9 })) }]
            })),
            columnGap: 12,
            margin: [0, 0, 0, 8]
        }] : [])
    ];
}

/** @param {any} block @param {BlockContext} ctx */
function photoGrid(block, ctx) {
    const perRow = PHOTOS_PER_ROW[ctx.layout.pageOrientation];
    const width = (ctx.layout.contentWidth - PHOTO_GAP * (perRow - 1)) / perRow;
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

/** @param {any} block @param {BlockContext} ctx */
function qr(block, ctx) {
    const label = { text: block.label, bold: true, fontSize: 9 };
    // Only the address of this Hub gets a code: a report cannot print a code for another site
    if (!isOriginUrl(block.url, ctx.origin)) return [{ stack: [label, { text: block.url, fontSize: 8, color: MUTED }], margin: [0, 0, 0, 8] }];
    return [{
        columns: [
            { svg: qrSvg(ctx.qr(block.url), QR_POINTS), width: QR_POINTS },
            { stack: [label, { text: block.url, fontSize: 8, color: MUTED, link: block.url, margin: [0, 2, 0, 0] }], margin: [10, 4, 0, 0] }
        ],
        unbreakable: true,
        margin: [0, 4, 0, 8]
    }];
}

/** @param {any} block */
function note(block) {
    return {
        table: { widths: ['*'], body: [[{ text: block.text, fontSize: 9.5, color: INK, fillColor: block.tone === 'warning' ? WARNING_FILL : INFO_FILL, margin: [4, 3, 4, 3] }]] },
        layout: 'noBorders',
        margin: [0, 0, 0, 8],
        unbreakable: true
    };
}

/** @param {any} block */
function signOff(block) {
    return [
        ...(block.byline ? [{ text: block.byline, margin: [0, 0, 0, 14] }] : []),
        {
            columns: block.lines.map((/** @type {{ label: string }} */ entry) => ({
                stack: [
                    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 150, y2: 0, lineWidth: 0.5, lineColor: MUTED }], margin: [0, 28, 0, 3] },
                    { text: entry.label, fontSize: 8, color: MUTED }
                ]
            })),
            columnGap: 14,
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
        case 'logo': return ctx.assets.logo ? [{ image: ctx.assets.logo.dataUrl, fit: [COVER_LOGO.width, COVER_LOGO.height], margin: [0, 20, 0, 0] }] : [];
        case 'heading': return [heading(block, ctx)];
        case 'keyValue': return [keyValue(block.rows)];
        case 'table': return table(block, ctx);
        case 'markdown': return markdownToPdf(block.text, { link: ctx.colours.accent });
        case 'note': return [note(block)];
        case 'signOff': return signOff(block);
        case 'summaryStats': return summaryStats(block);
        case 'photoGrid': return photoGrid(block, ctx);
        case 'qr': return qr(block, ctx);
        case 'mapSnapshot': return [figure(block, ctx.assets.figures.get(block), figureBox(ctx.layout, block), block.alt), ...legendNodes(block.legend)];
        case 'chart': return [figure(block, ctx.assets.figures.get(block), figureBox(ctx.layout, block), block.alt)];
        // With no capture the model says so ("No 3D snapshot"); with one that could not be read, the note says why
        case 'capture3d': return [figure(block, ctx.assets.figures.get(block), figureBox(ctx.layout, block), block.text)];
        default: return [];
    }
}
