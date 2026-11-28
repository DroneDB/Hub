/**
 * The cover page of the PDF: a band of the primary colour across the top of the page with the title and the subtitle in
 * it, the logo on a white card above it, then the facts (prepared by and for, date, dataset), the headline figures, the
 * overview map and the QR code of the live page. On a portrait page they follow one another; on a landscape page the
 * facts, the figures and the code are on the left and the map on the right.
 *
 * The band is part of the flow: a table of one cell filled with the primary colour that runs to both edges of the page,
 * with the title and the subtitle in it (and the QR code of the live page on a white card at its right), so that a long
 * title makes the band taller and pushes the rest of the cover down instead of leaving the band. The stripe of the accent
 * colour is its bottom border. The page background draws only what is behind the logo.
 */
import { INK, MUTED, WHITE, tint, textOn } from '@/libs/reports/pdf/pdfTheme';
import { figureOf, kpiTiles, qrCodeOf } from '@/libs/reports/pdf/pdfBlocks';
import { qrSvg } from '@/libs/qr';

/** The logo at the top left of the cover, in points */
const LOGO_CARD = Object.freeze({ x: 0, y: 24, width: 190, height: 62, padding: 10 });
/** The QR code of the live page, on a white card at the right of the band (`label`: the caption under the code, as tall as pdfmake lays it out with its space) */
const QR = Object.freeze({ side: 62, padding: 6, label: 24 });
/** The space between the title and the white card, in points */
const BAND_CARD_GAP = 18;
/**
 * The width of a character of the title as a share of its size (Roboto Bold), to tell how many lines it takes: the
 * width of wide capitals, as a title in capitals is common and an estimate a line short leaves the map too much room
 */
const TITLE_CHARACTER = 0.7;

/**
 * Where the band of the cover begins and how tall it is at least (a taller title makes it taller): the title is `pad` from
 * its top and `padBottom` from its bottom, there is room for the white card of the QR code when the cover has one, and
 * `gap` is left between the stripe and the rest of the cover. A landscape page has the room for less of each.
 * @param {import('./pdfLayout').PageLayout} layout @param {boolean} hasQr
 */
export function coverBand(layout, hasQr) {
    const landscape = layout.pageOrientation === 'landscape';
    const top = LOGO_CARD.y + LOGO_CARD.height + 14;
    const pad = landscape ? 14 : 34;
    const padBottom = landscape ? 8 : 16;
    const height = Math.max(landscape ? 100 : 150, hasQr ? pad + qrCardSize().h + padBottom : 0);
    return { top, pad, padBottom, gap: landscape ? 10 : 20, height, stripe: 5 };
}

/**
 * What the page background draws on the cover: the accent rule under the title of a cover with no logo.
 * @param {import('./pdfLayout').PageLayout} layout @param {{ primary: string, accent: string }} colours @param {boolean} hasLogo
 */
export function coverBackground(layout, colours, hasLogo) {
    const [left] = layout.margins;
    return [{ canvas: hasLogo ? [] : [{ type: 'rect', x: left, y: LOGO_CARD.y + LOGO_CARD.height - 3, w: 40, h: 3, color: colours.accent }] }];
}

/** The white card of the QR code. */
function qrCardSize() {
    return { w: QR.side + QR.padding * 2, h: QR.side + QR.padding * 2 + QR.label };
}

/**
 * The QR code of the live page of the cover, when it has one: the live page is an address of this Hub that a code can hold.
 * @param {import('@/libs/reports/reportParts').CoverPart} part @param {import('./pdfBlocks').BlockContext} ctx
 */
export const coverQr = (part, ctx) => (part.qr ? qrCodeOf(ctx, part.qr.url) : null);

/** The size of the title, smaller for a long one so that it stays in the band. @param {string} text */
const titleSize = text => (text.length > 70 ? 20 : text.length > 45 ? 24 : 28);

/**
 * How tall the title and the subtitle are once laid out in `width`, about: a text is as many lines as its characters take.
 * @param {string} title @param {string} subtitle @param {number} width
 */
function titleHeight(title, subtitle, width) {
    const size = titleSize(title);
    const lines = (/** @type {string} */ text, /** @type {number} */ fontSize) => Math.max(1, Math.ceil((text.length * fontSize * TITLE_CHARACTER) / width));
    // A line is wrapped at a word, so the last word of a line can leave most of a line empty: one line more is kept
    // for a title of more than one line
    const titleLines = lines(title, size);
    return (titleLines > 1 ? titleLines + 1 : titleLines) * size * 1.05 + 8 + (subtitle ? lines(subtitle, 13) * 13 * 1.15 : 0);
}

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
 * The band of the cover: the title and the subtitle on the primary colour, and the white card with the QR code of the live
 * page at its right. It is a table of one cell as wide as the page, taller than its minimum when the title needs it.
 * @param {import('@/libs/reports/reportParts').CoverPart} part
 * @param {import('./pdfBlocks').BlockContext} ctx
 * @param {ReturnType<typeof coverBand>} band
 * @param {{ size: number, path: string } | null} code  the QR code of the live page
 * @param {number} titleWidth  the room the title has, in points
 */
function bandNode(part, ctx, band, code, titleWidth) {
    const { layout, colours } = ctx;
    const [left, , right] = layout.margins;
    const onBand = textOn(colours.primary);
    const title = part.title?.text ?? '';
    const { w: cardWidth } = qrCardSize();
    const live = part.qr?.url ?? '';
    const card = code ? [{
        width: cardWidth,
        table: {
            widths: [cardWidth],
            body: [[{
                fillColor: WHITE,
                margin: [QR.padding, QR.padding, QR.padding, QR.padding],
                stack: [
                    { svg: qrSvg(code, QR.side), width: QR.side, link: live },
                    { text: 'Live report', fontSize: 7, bold: true, color: INK, alignment: 'center', link: live, margin: [0, 1, 0, 0] }
                ]
            }]]
        },
        layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 }
    }] : [];
    return {
        table: {
            widths: ['*'],
            body: [[{
                fillColor: colours.primary,
                margin: [left, band.pad, right, band.padBottom],
                columns: [
                    {
                        width: titleWidth,
                        stack: [
                            { text: title, style: 'coverTitle', fontSize: titleSize(title), color: onBand },
                            ...(part.subtitle ? [{ text: part.subtitle.text, style: 'coverSubtitle', color: onBand === WHITE ? tint(colours.primary, 0.78) : MUTED }] : [])
                        ]
                    },
                    ...(card.length ? [{ width: BAND_CARD_GAP, text: '' }] : []),
                    ...card,
                    // A column of the colour of the band that is as tall as the band is at least
                    { width: 1, canvas: [{ type: 'rect', x: 0, y: 0, w: 1, h: band.height - band.pad - band.padBottom, color: colours.primary }] }
                ]
            }]]
        },
        layout: {
            hLineWidth: (/** @type {number} */ i) => (i === 1 ? band.stripe : 0), vLineWidth: () => 0, hLineColor: () => colours.accent,
            paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0
        },
        // To both edges of the page, and a space under it
        margin: [-left, 0, -right, band.gap]
    };
}

/**
 * The content of the cover: the logo on the page, the band with the title, then the flow under it.
 * @param {import('@/libs/reports/reportParts').CoverPart} part
 * @param {import('./pdfBlocks').BlockContext} ctx
 * @returns {any[]}
 */
export function coverNodes(part, ctx) {
    const { layout, colours } = ctx;
    const [left, top] = layout.margins;
    const landscape = layout.pageOrientation === 'landscape';
    const code = coverQr(part, ctx);
    const band = coverBand(layout, !!code);

    /** @type {any[]} */
    const placed = [];
    if (ctx.assets.logo) {
        placed.push({
            image: ctx.assets.logo.dataUrl,
            fit: [LOGO_CARD.width - LOGO_CARD.padding * 2, LOGO_CARD.height - LOGO_CARD.padding * 2],
            absolutePosition: { x: left, y: LOGO_CARD.y + LOGO_CARD.padding }
        });
    }
    const titleWidth = layout.contentWidth - 1 - (code ? qrCardSize().w + BAND_CARD_GAP : 0);
    // The page is laid out from the top margin: the flow starts where the band does
    const bandStart = { text: '', margin: [0, Math.max(0, band.top - top), 0, 0] };
    const title = part.title?.text ?? '';
    const content = Math.max(titleHeight(title, part.subtitle?.text ?? '', titleWidth), code ? qrCardSize().h : 0);
    const bandHeight = Math.max(band.height, band.pad + content + band.padBottom);
    const bandNodes = [bandStart, bandNode(part, ctx, band, code, titleWidth)];

    const facts = part.facts ? part.facts.rows : [];
    // The map has the room the facts and the figures leave on the page (a page that overflows by a margin would leave
    // an empty page after the cover)
    const flowTop = Math.max(top, band.top + bandHeight + band.stripe + band.gap);
    const factRows = landscape ? Math.ceil(facts.length / 2) : Math.ceil(facts.length / Math.max(1, Math.min(4, facts.length)));
    // A row of facts (two lines of value) and the row of tiles, as tall as pdfmake lays them out
    const above = landscape ? 0 : factRows * 72 + (part.kpis ? 110 : 0);
    const room = layout.height - layout.margins[3] - flowTop - above - (part.map?.legend?.length ? 52 : 34) - 16;
    const map = part.map ? figureOf(part.map, ctx, { maxHeight: room }).map(node => ({ ...node, margin: [0, 0, 0, 0] })) : [];
    // A live page with no code (on another site, or too long for one) has its address written under the facts
    const written = part.qr && !code ? [{ stack: [{ text: part.qr.label, bold: true, fontSize: 8 }, { text: part.qr.url, link: part.qr.url, fontSize: 8, color: MUTED }], margin: [0, 0, 0, 8] }] : [];
    const rest = part.rest.flatMap(block => (block.type === 'note' ? [{ text: block.text, fontSize: 9, color: INK, background: '#fef08a', margin: [0, 0, 0, 8] }] : []));

    if (landscape && map.length) {
        const leftWidth = layout.contentWidth * 0.37;
        return [
            ...placed,
            ...bandNodes,
            {
                columns: [
                    {
                        width: leftWidth,
                        stack: [
                            ...(facts.length ? [factCells(facts, 2, colours.accent)] : []),
                            ...(part.kpis ? kpiTiles(part.kpis, ctx, { perRow: 2, width: leftWidth }) : []),
                            ...rest,
                            ...written
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
        ...bandNodes,
        ...(facts.length ? [factCells(facts, Math.min(4, facts.length), colours.accent)] : []),
        ...(part.kpis ? kpiTiles(part.kpis, ctx) : []),
        ...rest,
        ...map,
        ...written
    ];
}
