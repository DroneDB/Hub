// @ts-check
/**
 * The page of an item in the PDF. A header card: the reference on a square of the item's colour, the name, the kind and
 * the badges (category, severity, status, overdue), and the QR code of the item's address on the live page at the right.
 * Under it the figures, the facts, the description and the photos: on a portrait page each across the page; on a
 * landscape page the first figure (the map, else the 3D capture) on the left with the facts and the description beside
 * it, the other figures in a row under them, then the photos.
 */
import { INK, MUTED, SUBTLE, WHITE, textOn } from '@/libs/reports/pdf/pdfTheme';
import { badgeLine, callout, figureOf, keyValue, photoGrid, qrCodeOf } from '@/libs/reports/pdf/pdfBlocks';
import { markdownToPdf } from '@/libs/reports/pdf/pdfMarkdown';
import { itemFacts } from '@/libs/reports/reportParts';
import { NO_REF } from '@/libs/reports/reportItems';
import { qrSvg } from '@/libs/qr';

/** The side of the QR code in the header card, in points */
const QR_SIDE = 50;

/**
 * The header card of an item.
 * @param {import('@/libs/reports/reportParts').ItemPart} part @param {import('./pdfBlocks').BlockContext} ctx
 */
function headerCard(part, ctx) {
    const { heading } = part;
    const colour = heading.colour || ctx.colours.primary;
    const code = part.qr ? qrCodeOf(ctx, part.qr.url) : null;
    const name = { text: heading.name || heading.text, fontSize: 14, bold: true, color: INK };
    const title = {
        stack: [
            name,
            ...(heading.kind ? [{ text: heading.kind, fontSize: 8, bold: true, color: MUTED, characterSpacing: 0.3, margin: [0, 2, 0, 4] }] : []),
            ...(heading.badges?.length ? [badgeLine(heading.badges)] : []),
            // An address with no code (an item on another site, or an address too long for a code) is written out
            ...(part.qr && !code ? [{ text: [{ text: `${part.qr.label}: `, bold: true }, { text: part.qr.url, link: part.qr.url }], fontSize: 7.5, color: MUTED, margin: [0, 3, 0, 0] }] : [])
        ],
        margin: [12, 9, 8, 9]
    };
    const linked = part.qr && code ? { url: part.qr.url, code } : null;
    const ref = heading.ref || NO_REF;
    return {
        table: {
            widths: [52, '*', ...(linked ? [QR_SIDE + 14] : [])],
            body: [[
                { text: ref, fontSize: ref.length > 4 ? 11 : 15, bold: true, color: textOn(colour), fillColor: colour, alignment: 'center', margin: [2, 16, 2, 0] },
                { ...title, fillColor: SUBTLE },
                ...(linked ? [{
                    stack: [
                        { svg: qrSvg(linked.code, QR_SIDE), width: QR_SIDE, link: linked.url },
                        { text: 'Live item', fontSize: 6.5, color: MUTED, alignment: 'center', link: linked.url, margin: [0, 1, 0, 0] }
                    ],
                    fillColor: SUBTLE, margin: [7, 6, 7, 4]
                }] : [])
            ]]
        },
        layout: {
            hLineWidth: (/** @type {number} */ i) => (i === 1 ? 1.5 : 0), hLineColor: () => colour, vLineWidth: () => 0,
            paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0
        },
        margin: [0, 0, 0, 12],
        unbreakable: true
    };
}

/** The description of an item, in a box with a bar of its colour. @param {any} block @param {string} colour @param {{ accent: string }} colours */
const description = (block, colour, colours) => (block ? [callout(markdownToPdf(block.text, { link: colours.accent }), colour)] : []);

/** A title over a part of the page of an item. @param {string} text */
const label = text => ({ text: text.toUpperCase(), fontSize: 7.5, bold: true, color: MUTED, characterSpacing: 0.6, margin: [0, 2, 0, 4] });

/**
 * The entry of the contents and the destination of the links of an item: the reference and the name, as the heading of
 * the model says them (the card shows the reference apart, on its square); a mark of no size where the card begins,
 * which starts a page unless the item follows the title of its section.
 * @param {import('@/libs/reports/reportParts').ItemPart} part @param {import('./pdfBlocks').BlockContext} ctx @param {boolean} first
 */
function itemEntry(part, ctx, first) {
    const entry = /** @type {Record<string, any>} */ ({ text: part.heading.text, style: 'itemEntry', fontSize: 0.1, color: WHITE, lineHeight: 0.1, tocItem: true, tocStyle: { fontSize: 9 }, tocMargin: [14, 0, 0, 0] });
    if (part.heading.anchor && !ctx.used.has(part.heading.anchor)) {
        ctx.used.add(part.heading.anchor);
        entry.id = part.heading.anchor;
    }
    return [first ? entry : { ...entry, pageBreak: 'before' }];
}

/**
 * The photos of an item under their title, which stays with their first row.
 * @param {any} block @param {import('./pdfBlocks').BlockContext} ctx @param {{ perRow?: number, width?: number }} [options]
 */
function photoBlock(block, ctx, options) {
    const rows = photoGrid(block, ctx, options);
    return rows.length ? [{ stack: [label('Photos'), rows[0]], unbreakable: true }, ...rows.slice(1)] : [];
}

/**
 * The content of an item's page; it starts on a page of its own unless it is the first thing of its section.
 * @param {import('@/libs/reports/reportParts').ItemPart} part
 * @param {import('./pdfBlocks').BlockContext} ctx
 * @param {boolean} first  the item follows the title of its section on the page
 * @returns {any[]}
 */
export function itemNodes(part, ctx, first) {
    const { layout, colours } = ctx;
    const colour = part.heading.colour || colours.primary;
    const facts = itemFacts(part.facts);
    /** The width of one of two columns, with the gap between them. @param {number} gap */
    const half = gap => (layout.contentWidth - gap) / 2;
    const factsTable = facts.length ? [label('Details'), keyValue(facts, 92)] : [];
    const rest = part.rest.flatMap(block => (block.type === 'note' ? [{ text: block.text, fontSize: 9, background: '#fef08a', margin: [0, 0, 0, 8] }] : []));
    const photos = part.photos ? photoBlock(part.photos, ctx) : [];
    /** @type {any[]} */
    let body;
    if (layout.pageOrientation === 'landscape' && part.figures.length) {
        const [lead, ...others] = part.figures;
        const leadWidth = lead.type === 'chart' ? layout.contentWidth : layout.contentWidth * (lead.type === 'capture3d' ? 0.49 : 0.55);
        const side = [...factsTable, ...description(part.description, colour, colours), ...rest];
        // The photos go under the lead figure, in its column, where the page has room beside the facts
        const leftPhotos = lead.type !== 'chart' && part.photos ? photoBlock(part.photos, ctx, { perRow: 3, width: leadWidth }) : [];
        if (others.length && lead.type !== 'chart') {
            // Two figures (the map and the 3D capture of a 3D item): side by side across the page, the facts and the
            // description beside each other under them, then the photos
            const text = [...description(part.description, colour, colours), ...rest];
            body = [
                { columns: [lead, ...others].slice(0, 2).map(block => ({ width: '*', stack: figureOf(block, ctx, { maxWidth: half(16) }) })), columnGap: 16 },
                ...[lead, ...others].slice(2).flatMap(block => figureOf(block, ctx)),
                text.length && factsTable.length ? { columns: [{ width: '50%', stack: factsTable }, { width: '*', stack: [label('Notes'), ...text] }], columnGap: 16 } : { stack: [...factsTable, ...text] },
                ...photos
            ];
            const card = headerCard(part, ctx);
            return [...itemEntry(part, ctx, first), card, ...body];
        }
        body = [
            lead.type === 'chart'
                ? { stack: [...figureOf(lead, ctx), ...side] }
                : { columns: [{ width: leadWidth, stack: [...figureOf(lead, ctx, { maxWidth: leadWidth }), ...leftPhotos] }, { width: '*', stack: side }], columnGap: 16 },
            ...(leftPhotos.length ? [] : photos)
        ];
    } else {
        // Two figures side by side (the map and the 3D capture of a 3D item), one across the page
        const [one, two, ...more] = part.figures;
        const figures = two
            ? [{ columns: [{ width: '*', stack: figureOf(one, ctx, { maxWidth: half(12) }) }, { width: '*', stack: figureOf(two, ctx, { maxWidth: half(12) }) }], columnGap: 12 }, ...more.flatMap(block => figureOf(block, ctx))]
            : (one ? figureOf(one, ctx) : []);
        const text = [...description(part.description, colour, colours), ...rest];
        body = [
            ...figures,
            // The facts and the description side by side when there is a description, the facts across the page else
            ...(text.length && factsTable.length
                ? [{ columns: [{ width: '52%', stack: factsTable }, { width: '*', stack: [label('Notes'), ...text] }], columnGap: 16 }]
                : [...factsTable, ...text]),
            ...photos
        ];
    }
    const card = headerCard(part, ctx);
    return [...itemEntry(part, ctx, first), card, ...body];
}

