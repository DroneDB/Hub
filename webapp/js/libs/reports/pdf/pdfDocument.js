// @ts-check
/**
 * The PDF of a report as a pdfmake document definition: a pure function of the report model, with no DOM and no PDF
 * library (the definition is data that the library turns into a file). The model is the one the live page draws, so the
 * two have the same sections, the same items in the same order and the same text: this file only chooses the page.
 *
 *   cover, contents, then the sections the model has, in its order; an item has a page of its own, with the QR code of
 *   its address on the live page; a header with the logo, the title and the header text of the template; a footer with
 *   the footer text and `page / pages`.
 */
import { blockNodes, INK, MUTED } from '@/libs/reports/pdf/pdfBlocks';
import { pageLayout } from '@/libs/reports/pdf/pdfLayout';

export const CONTENTS_TITLE = 'Contents';
/** The height of the logo in the header, in points */
const LOGO_HEIGHT = 30;
const LOGO_WIDTH = 120;

/**
 * @typedef {object} PdfOptions
 * @property {import('./pdfAssets').PdfAssets} assets  the images prepared for the report
 * @property {(text: string) => { size: number, path: string }} qr  the QR encoder (libs/qr)
 * @property {string} origin  of the Hub, the only origin a QR code is made for
 */

/** @param {{ primary: string, accent: string }} colours */
function styles(colours) {
    return {
        coverTitle: { fontSize: 28, bold: true, color: colours.primary, margin: [0, 50, 0, 6] },
        coverSubtitle: { fontSize: 15, color: MUTED, margin: [0, 0, 0, 18] },
        h1: { fontSize: 18, bold: true, color: colours.primary, margin: [0, 0, 0, 10] },
        h2: { fontSize: 13.5, bold: true, color: INK, margin: [0, 0, 0, 6] },
        h3: { fontSize: 11, bold: true, color: INK, margin: [0, 6, 0, 4] },
        tableTitle: { fontSize: 10.5, bold: true, margin: [0, 6, 0, 4] },
        tableHeader: { bold: true, fontSize: 8.5 },
        tableCell: { fontSize: 8.5 },
        caption: { fontSize: 8, italics: true, color: MUTED, margin: [0, 2, 0, 4] }
    };
}

/**
 * The header of every page: the logo, the title of the report and the header text of the template.
 * @param {any} model @param {import('./pdfLayout').PageLayout} layout @param {import('./pdfBlocks').BlockContext['assets']} assets
 */
function header(model, layout, assets) {
    const [left, , right] = layout.margins;
    const text = {
        stack: [
            { text: model.title, bold: true, fontSize: 9, color: INK },
            ...(model.template.headerText ? [{ text: model.template.headerText, fontSize: 8, color: MUTED }] : [])
        ],
        width: '*',
        margin: [0, 2, 0, 0]
    };
    const logo = assets.logo ? { image: assets.logo.dataUrl, fit: [LOGO_WIDTH, LOGO_HEIGHT], width: 'auto', margin: [0, 0, 10, 0] } : null;
    return () => ({ margin: [left, 22, right, 0], columns: logo ? [logo, text] : [text] });
}

/**
 * The footer of every page: the footer text of the template, and the page number out of the page count.
 * @param {any} model @param {import('./pdfLayout').PageLayout} layout
 */
function footer(model, layout) {
    const [left, , right] = layout.margins;
    return (/** @type {number} */ page, /** @type {number} */ pages) => ({
        margin: [left, 18, right, 0],
        columns: [
            { text: model.template.footerText || '', fontSize: 8, color: MUTED, width: '*' },
            { text: `${page} / ${pages}`, fontSize: 8, color: MUTED, alignment: 'right', width: 'auto' }
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
 * The PDF document definition of a report model.
 * @param {any} model  the report model (libs/reports/reportModel)
 * @param {PdfOptions} options
 */
export function buildPdfDocument(model, { assets, qr, origin }) {
    const layout = pageLayout(model.template);
    const colours = { primary: model.template.primary, accent: model.template.accent };
    const destinations = itemAnchors(model);
    const used = new Set();

    /** The content of each section, then the contents list after the cover. @type {any[][]} */
    const groups = model.sections.map((/** @type {any} */ section) => section.blocks.flatMap((/** @type {any} */ block, /** @type {number} */ index) => blockNodes(block, {
        layout, assets, qr, origin, colours, destinations, used, section, previous: section.blocks[index - 1] ?? null
    })));
    const listed = model.sections.some((/** @type {any} */ s) => s.kind !== 'cover');
    if (listed) {
        const contents = [{ toc: { title: { text: CONTENTS_TITLE, style: 'h1' }, numberStyle: { fontSize: 9, color: MUTED } } }];
        groups.splice(model.sections[0]?.kind === 'cover' ? 1 : 0, 0, contents);
    }
    // Every section, and the contents, start on a page of their own
    const content = groups.flatMap((nodes, index) => {
        if (index > 0 && nodes.length) nodes[0] = { ...nodes[0], pageBreak: 'before' };
        return nodes;
    });

    return {
        info: { title: model.title, subject: model.datasetName || undefined, creator: 'DroneDB Hub', creationDate: new Date(model.generatedAt) },
        pageSize: layout.pageSize,
        pageOrientation: layout.pageOrientation,
        pageMargins: layout.margins,
        defaultStyle: { font: 'Roboto', fontSize: 10, color: INK, lineHeight: 1.15 },
        styles: styles(colours),
        header: header(model, layout, assets),
        footer: footer(model, layout),
        content
    };
}
