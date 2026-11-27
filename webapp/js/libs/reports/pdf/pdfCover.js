// @ts-check
/**
 * The cover page of the PDF: a band of the primary colour across the top of the page with the title and the subtitle in
 * it, the logo on a white card above it, then the facts (prepared by and for, date, dataset), the headline figures, the
 * overview map and the QR code of the live page. On a portrait page they follow one another; on a landscape page the
 * facts, the figures and the code are on the left and the map on the right.
 *
 * The band is drawn by the page background (pdfDocument), at the heights this file gives (coverBand): the title and the
 * subtitle are placed in it, and the flow of the page starts under it.
 */
import { INK, MUTED, WHITE, tint, textOn } from '@/libs/reports/pdf/pdfTheme';
import { figureOf, kpiTiles } from '@/libs/reports/pdf/pdfBlocks';
import { qrSvg } from '@/libs/qr';
import { isOriginUrl } from '@/libs/originUrl';

/** The logo at the top left of the cover, in points */
const LOGO_CARD = Object.freeze({ x: 0, y: 24, width: 190, height: 62, padding: 10 });
/** The QR code of the live page, on a white card at the right of the band */
const QR = Object.freeze({ side: 62, padding: 6, label: 12 });

/**
 * Where the band of the cover is: from the top of the page to `bottom`, with a stripe of the accent colour under it.
 * @param {import('./pdfLayout').PageLayout} layout
 */
export function coverBand(layout) {
    const landscape = layout.pageOrientation === 'landscape';
    const top = LOGO_CARD.y + LOGO_CARD.height + 14;
    return { top, bottom: top + (landscape ? 100 : 150), stripe: 5 };
}

/**
 * What the page background draws on the cover: the band, its stripe and the white card of the logo.
 * @param {import('./pdfLayout').PageLayout} layout @param {{ primary: string, accent: string }} colours @param {boolean} hasLogo
 * @param {boolean} hasQr  the cover has the QR code of the live page, on a white card
 */
export function coverBackground(layout, colours, hasLogo, hasQr) {
    const band = coverBand(layout);
    const [left] = layout.margins;
    const card = qrCard(layout);
    return [{
        canvas: [
            { type: 'rect', x: 0, y: band.top, w: layout.width, h: band.bottom - band.top, color: colours.primary },
            { type: 'rect', x: 0, y: band.bottom, w: layout.width, h: band.stripe, color: colours.accent },
            // A soft lighter block at the right of the band, for depth
            { type: 'rect', x: layout.width * 0.62, y: band.top, w: layout.width * 0.38, h: band.bottom - band.top, color: tint(colours.primary, 0.08) },
            ...(hasLogo ? [] : [{ type: 'rect', x: left, y: LOGO_CARD.y + LOGO_CARD.height - 3, w: 40, h: 3, color: colours.accent }]),
            ...(hasQr ? [{ type: 'rect', x: card.x, y: card.y, w: card.w, h: card.h, r: 4, color: WHITE }] : [])
        ]
    }];
}

/** The white card of the QR code: at the right of the band, in the middle of its height. @param {import('./pdfLayout').PageLayout} layout */
function qrCard(layout) {
    const band = coverBand(layout);
    const [, , right] = layout.margins;
    const w = QR.side + QR.padding * 2;
    const h = QR.side + QR.padding * 2 + QR.label;
    return { x: layout.width - right - w, y: band.top + (band.bottom - band.top - h) / 2, w, h };
}

/**
 * Whether the cover has a QR code to draw: the live page is an address of this Hub.
 * @param {import('@/libs/reports/reportParts').CoverPart} part @param {string} origin
 */
export const coverHasQr = (part, origin) => !!part.qr && isOriginUrl(part.qr.url, origin);

/** The size of the title, smaller for a long one so that it stays in the band. @param {string} text */
const titleSize = text => (text.length > 70 ? 20 : text.length > 45 ? 24 : 28);

/**
 * The facts of the cover as small labelled cells, two or four to a row.
 * @param {{ label: string, value: string }[]} rows @param {number} perRow @param {string} accent
 */
function factCells(rows, perRow, accent) {
    /** @type {any[][]} */
    const body = [];
    for (let i = 0; i < rows.length; i += perRow) {
        /** @type {any[]} */
        const cells = rows.slice(i, i + perRow).map(row => ({
            stack: [
                { text: row.label, fontSize: 7.5, bold: true, color: MUTED, characterSpacing: 0.3 },
                { text: row.value, fontSize: 10, bold: true, color: INK, margin: [0, 1, 0, 0] }
            ],
            margin: [8, 0, 6, 8]
        }));
        while (cells.length < perRow) cells.push({ text: '' });
        body.push(cells);
    }
    return {
        table: { widths: Array.from({ length: perRow }, () => '*'), body },
        layout: {
            hLineWidth: () => 0, vLineWidth: (/** @type {number} */ i) => (i < perRow ? 2 : 0), vLineColor: () => accent,
            paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0
        },
        margin: [0, 0, 0, 14]
    };
}

/**
 * The content of the cover: the logo and the title placed on the band, then the flow under it.
 * @param {import('@/libs/reports/reportParts').CoverPart} part
 * @param {import('./pdfBlocks').BlockContext} ctx
 * @returns {any[]}
 */
export function coverNodes(part, ctx) {
    const { layout, colours } = ctx;
    const band = coverBand(layout);
    const [left, top, right] = layout.margins;
    const landscape = layout.pageOrientation === 'landscape';
    const onBand = textOn(colours.primary);
    const title = part.title?.text ?? '';

    /** @type {any[]} */
    const placed = [];
    if (ctx.assets.logo) {
        placed.push({
            image: ctx.assets.logo.dataUrl,
            fit: [LOGO_CARD.width - LOGO_CARD.padding * 2, LOGO_CARD.height - LOGO_CARD.padding * 2],
            absolutePosition: { x: left, y: LOGO_CARD.y + LOGO_CARD.padding }
        });
    }
    const withQr = coverHasQr(part, ctx.origin);
    const card = qrCard(layout);
    placed.push({
        columns: [{
            width: (withQr ? card.x - 18 : layout.width - right) - left,
            stack: [
                { text: title, style: 'coverTitle', fontSize: titleSize(title), color: onBand },
                ...(part.subtitle ? [{ text: part.subtitle.text, style: 'coverSubtitle', color: onBand === WHITE ? tint(colours.primary, 0.78) : MUTED }] : [])
            ]
        }],
        absolutePosition: { x: left, y: band.top + (landscape ? 20 : 34) }
    });
    if (part.qr && withQr) {
        placed.push(
            { svg: qrSvg(ctx.qr(part.qr.url), QR.side), width: QR.side, link: part.qr.url, absolutePosition: { x: card.x + QR.padding, y: card.y + QR.padding } },
            { text: 'Live report', fontSize: 7, bold: true, color: INK, alignment: 'center', link: part.qr.url, absolutePosition: { x: card.x, y: card.y + QR.padding + QR.side + 1 }, width: card.w }
        );
    }

    const facts = part.facts ? part.facts.rows : [];
    // The flow starts under the band
    const spacer = { text: '', margin: [0, Math.max(0, band.bottom + band.stripe + 20 - top), 0, 0] };
    // The map has the room the facts and the figures leave on the page (a page that overflows by a margin would leave
    // an empty page after the cover)
    const flowTop = Math.max(top, band.bottom + band.stripe + 20);
    const factRows = landscape ? Math.ceil(facts.length / 2) : Math.ceil(facts.length / Math.max(1, Math.min(4, facts.length)));
    // A row of facts (two lines of value) and the row of tiles, as tall as pdfmake lays them out
    const above = landscape ? 0 : factRows * 72 + (part.kpis ? 110 : 0);
    const room = layout.height - layout.margins[3] - flowTop - above - (part.map?.legend?.length ? 52 : 34) - 16;
    const map = part.map ? figureOf(part.map, ctx, { maxHeight: room }).map(node => ({ ...node, margin: [0, 0, 0, 0] })) : [];
    // A live page on another site has no code: its address is written under the facts
    const code = part.qr && !withQr ? [{ stack: [{ text: part.qr.label, bold: true, fontSize: 8 }, { text: part.qr.url, link: part.qr.url, fontSize: 8, color: MUTED }], margin: [0, 0, 0, 8] }] : [];
    const rest = part.rest.flatMap(block => (block.type === 'note' ? [{ text: block.text, fontSize: 9, color: INK, background: '#fef08a', margin: [0, 0, 0, 8] }] : []));

    if (landscape && map.length) {
        const leftWidth = layout.contentWidth * 0.37;
        return [
            ...placed,
            spacer,
            {
                columns: [
                    {
                        width: leftWidth,
                        stack: [
                            ...(facts.length ? [factCells(facts, 2, colours.accent)] : []),
                            ...(part.kpis ? kpiTiles(part.kpis, ctx, { perRow: 2, width: leftWidth }) : []),
                            ...rest,
                            ...code
                        ]
                    },
                    { width: '*', stack: map }
                ],
                columnGap: 18
            }
        ];
    }
    return [
        ...placed,
        spacer,
        ...(facts.length ? [factCells(facts, Math.min(4, facts.length), colours.accent)] : []),
        ...(part.kpis ? kpiTiles(part.kpis, ctx) : []),
        ...rest,
        ...map,
        ...code
    ];
}
