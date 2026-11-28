// @ts-check
/**
 * The PDF of a report as a pdfmake document definition: a pure function of the report model, with no DOM and no PDF
 * library (the definition is data that the library turns into a file). The model is the one the live page draws, so the
 * two have the same sections, the same items in the same order and the same text: this file only chooses the page.
 *
 *   cover (pdfCover), contents, then the sections the model has, in its order; an item has a page of its own (pdfItem),
 *   with the QR code of its address on the live page in its header card; a header with the logo, the title and the
 *   header text of the template on every page but the cover; a footer with the footer text and `page / pages`; a bar of
 *   the primary colour along the top of the page and of the accent colour along the bottom.
 */
import { blockNodes } from '@/libs/reports/pdf/pdfBlocks';
import { coverBackground, coverNodes } from '@/libs/reports/pdf/pdfCover';
import { itemNodes } from '@/libs/reports/pdf/pdfItem';
import { INK, MUTED, tint } from '@/libs/reports/pdf/pdfTheme';
import { pageLayout } from '@/libs/reports/pdf/pdfLayout';
import { sectionParts } from '@/libs/reports/reportParts';
import { withSymbols } from '@/libs/reports/pdf/pdfSymbols';
import { withPdfText } from '@/libs/reports/pdf/pdfText';

export const CONTENTS_TITLE = 'Contents';
/** The height of the logo in the header, in points */
const LOGO_HEIGHT = 26;
const LOGO_WIDTH = 110;

/**
 * @typedef {object} PdfOptions
 * @property {import('./pdfAssets').PdfAssets} assets  the images prepared for the report
 * @property {(text: string) => { size: number, path: string }} qr  the QR encoder (libs/qr)
 * @property {string} origin  of the Hub, the only origin a QR code is made for
 */

/** @param {{ primary: string, accent: string }} colours */
function styles(colours) {
    return {
        coverTitle: { fontSize: 28, bold: true, color: colours.primary, lineHeight: 1.05, margin: [0, 0, 0, 8] },
        coverSubtitle: { fontSize: 13, color: MUTED, margin: [0, 0, 0, 0] },
        h1: { fontSize: 20, bold: true, color: colours.primary, margin: [0, 0, 0, 4] },
        h2: { fontSize: 13.5, bold: true, color: INK, margin: [0, 0, 0, 6] },
        h3: { fontSize: 11, bold: true, color: INK, margin: [0, 6, 0, 4] },
        tableTitle: { fontSize: 11, bold: true, margin: [0, 4, 0, 6] },
        tableHeader: { bold: true, fontSize: 8.5 },
        tableCell: { fontSize: 8.5 },
        caption: { fontSize: 8, italics: true, color: MUTED, margin: [0, 2, 0, 4] }
    };
}

/**
 * The header of every page: the logo, the title of the report and the header text of the template.
 * @param {any} model @param {import('./pdfLayout').PageLayout} layout @param {import('./pdfBlocks').BlockContext['assets']} assets
 */
function header(model, layout, assets, hasCover) {
    const [left, , right] = layout.margins;
    const text = {
        stack: [
            { text: model.title, bold: true, fontSize: 9, color: INK },
            ...(model.template.headerText ? [{ text: model.template.headerText, fontSize: 8, color: MUTED }] : [])
        ],
        width: '*',
        margin: [0, 2, 0, 0]
    };
    const logo = assets.logo ? { image: assets.logo.dataUrl, fit: [LOGO_WIDTH, LOGO_HEIGHT], width: 'auto', margin: [0, 0, 12, 0] } : null;
    // The cover has its own top: no header there
    return (/** @type {number} */ page) => (hasCover && page === 1 ? null : {
        margin: [left, 20, right, 0],
        stack: [
            { columns: logo ? [logo, text] : [text] },
            { canvas: [{ type: 'line', x1: 0, y1: 6, x2: layout.contentWidth, y2: 6, lineWidth: 0.6, lineColor: tint(model.template.primary, 0.6) }] }
        ]
    });
}

/**
 * The footer of every page: the footer text of the template, and the page number out of the page count.
 * @param {any} model @param {import('./pdfLayout').PageLayout} layout
 */
function footer(model, layout) {
    const [left, , right] = layout.margins;
    const accent = model.template.accent;
    return (/** @type {number} */ page, /** @type {number} */ pages) => ({
        margin: [left, 16, right, 0],
        columns: [
            { text: model.template.footerText || '', fontSize: 7.5, color: MUTED, width: '*', margin: [0, 3, 0, 0] },
            { text: `\u00a0${page} / ${pages}\u00a0`, fontSize: 8, bold: true, color: INK, background: tint(accent, 0.8), alignment: 'right', width: 'auto', margin: [0, 2, 0, 0] }
        ]
    });
}

/**
 * The background of every page: on the cover its band; on the other pages a thin bar of the primary colour along the
 * top edge and of the accent colour along the bottom edge.
 * @param {import('./pdfLayout').PageLayout} layout @param {{ primary: string, accent: string }} colours
 * @param {any[] | null} cover  the background of the cover, when the report has one
 */
function background(layout, colours, cover) {
    return (/** @type {number} */ page) => (cover && page === 1 ? cover : {
        canvas: [
            { type: 'rect', x: 0, y: 0, w: layout.width, h: 5, color: colours.primary },
            { type: 'rect', x: 0, y: layout.height - 4, w: layout.width, h: 4, color: colours.accent }
        ]
    });
}

/**
 * The anchors of the item pages the model has: where a row of a table can link to.
 * @param {any} model
 * @returns {Set<string>}
 */
function itemAnchors(model) {
    return new Set(model.sections.flatMap((/** @type {any} */ s) => s.blocks).filter((/** @type {any} */ b) => b.type === 'heading' && b.anchor).map((/** @type {any} */ b) => b.anchor));
}

/**
 * A part of the definition as the PDF writes it: its texts as the font draws them (pdfText), the symbols the font lacks
 * in the font of the symbols.
 * @template T
 * @param {T} node
 * @returns {T}
 */
const drawn = node => withSymbols(withPdfText(node));

/**
 * A header or footer function whose texts are drawn as the PDF writes them.
 * @param {(...args: any[]) => any} make
 */
const drawnBy = make => (/** @type {any[]} */ ...args) => drawn(make(...args));

/**
 * The PDF document definition of a report model.
 * @param {any} model  the report model (libs/reports/reportModel)
 * @param {PdfOptions} options
 */
export function buildPdfDocument(model, { assets, qr, origin }) {
    const layout = pageLayout(model.template);
    const colours = { primary: model.template.primary, accent: model.template.accent };
    const destinations = itemAnchors(model);
    const used = new Set();

    const ctxOf = (/** @type {any} */ section, /** @type {any} */ previous) => ({ layout, assets, qr, origin, colours, destinations, used, section, previous });
    /** The cover part, when the report has a cover */
    let cover = null;
    /** The content of each section, then the contents list after the cover. @type {any[][]} */
    const groups = model.sections.map((/** @type {any} */ section) => {
        /** @type {any} */
        let previous = null;
        return sectionParts(section).flatMap(part => {
            const ctx = ctxOf(section, previous);
            if (part.type === 'cover') {
                cover = part;
                return coverNodes(part, ctx);
            }
            if (part.type === 'item') {
                // An item starts a page, unless it follows the title of its section there
                const first = previous?.type === 'heading' && previous.level === 1;
                previous = part.heading;
                return itemNodes(part, ctx, first);
            }
            previous = part.block;
            return blockNodes(part.block, ctx);
        });
    });
    const listed = model.sections.some((/** @type {any} */ s) => s.kind !== 'cover');
    if (listed) {
        const contents = [
            { text: CONTENTS_TITLE, style: 'h1' },
            { canvas: [{ type: 'rect', x: 0, y: 0, w: 46, h: 3, color: colours.accent }], margin: [0, 0, 0, 14] },
            { toc: { numberStyle: { fontSize: 9, color: MUTED } } }
        ];
        groups.splice(model.sections[0]?.kind === 'cover' ? 1 : 0, 0, contents);
    }
    // Every section, and the contents, start on a page of their own
    const content = groups.flatMap((nodes, index) => {
        if (index > 0 && nodes.length) nodes[0] = { ...nodes[0], pageBreak: 'before' };
        return nodes;
    });
    const coverPart = /** @type {any} */ (cover);

    return {
        info: { title: model.title, subject: model.datasetName || undefined, creator: 'DroneDB Hub', creationDate: new Date(model.generatedAt) },
        pageSize: layout.pageSize,
        pageOrientation: layout.pageOrientation,
        pageMargins: layout.margins,
        defaultStyle: { font: 'Roboto', fontSize: 10, color: INK, lineHeight: 1.15 },
        styles: styles(colours),
        // The texts are the ones the font draws, and the symbols Roboto has no glyph for (the arrows) are written in a font
        // of their own, wherever they are
        header: drawnBy(header(model, layout, assets, !!coverPart)),
        footer: drawnBy(footer(model, layout)),
        background: background(layout, colours, coverPart ? coverBackground(layout, colours, !!assets.logo) : null),
        content: drawn(content)
    };
}
