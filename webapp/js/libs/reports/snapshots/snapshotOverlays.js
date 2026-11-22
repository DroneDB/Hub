// @ts-check
/**
 * What a snapshot has drawn over the map, on the exported image itself (not as map controls, which an export of the
 * canvases does not hold): the attribution text of the basemap in the bottom right corner, which the provider's terms
 * ask for on every image of its tiles, and the legend of the category colours in the top left corner.
 */

import { htmlToText } from '@/libs/sanitize';

const FONT_FAMILY = 'Roboto, Arial, sans-serif';
const TEXT = '#111827';
const PLATE = 'rgba(255, 255, 255, 0.85)';

/** The size of the text of an image of this width, in pixels: it reads the same at 640 and at 1600 px. @param {number} width */
export const overlayFontSize = width => Math.max(11, Math.round(width / 110));

/**
 * The plain text of the attribution of a tile source (the attributions are HTML: "&copy; OpenStreetMap"), the entries
 * joined by a space. The markup is read by htmlToText as an inert document, never inserted into the page.
 * @param {any} source  an OpenLayers tile source
 * @returns {string}
 */
export function attributionText(source) {
    return attributionEntries(source)
        .map(html => htmlToText(html))
        .map(text => text.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .join(' ');
}

/** The attributions of a tile source as the source holds them (a list, or a function of the frame). @param {any} source @returns {unknown[]} */
function attributionEntries(source) {
    try {
        const attributions = source && typeof source.getAttributions === 'function' ? source.getAttributions() : null;
        const list = typeof attributions === 'function' ? attributions(/** @type {any} */ ({})) : attributions;
        return list ? [].concat(list) : [];
    } catch {
        return [];
    }
}

/**
 * Draws the attribution text on a plate in the bottom right corner.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} width
 * @param {number} height
 */
export function drawAttribution(ctx, text, width, height) {
    if (!text) return;
    const size = overlayFontSize(width);
    const pad = Math.round(size * 0.4);
    ctx.save();
    ctx.font = `${size}px ${FONT_FAMILY}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const textWidth = ctx.measureText(text).width;
    const boxWidth = textWidth + pad * 2;
    const boxHeight = size + pad * 2;
    ctx.fillStyle = PLATE;
    ctx.fillRect(width - boxWidth, height - boxHeight, boxWidth, boxHeight);
    ctx.fillStyle = TEXT;
    ctx.fillText(text, width - boxWidth + pad, height - boxHeight / 2);
    ctx.restore();
}

/**
 * Draws the legend (a swatch and a name for each entry) on a plate in the top left corner.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ name: string, colour: string }[]} entries
 * @param {number} width
 */
export function drawLegend(ctx, entries, width) {
    if (!entries || !entries.length) return;
    const size = overlayFontSize(width);
    const pad = Math.round(size * 0.6);
    const swatch = size;
    const gap = Math.round(size * 0.5);
    const rowHeight = Math.round(size * 1.5);
    ctx.save();
    ctx.font = `${size}px ${FONT_FAMILY}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const widest = Math.max(...entries.map(e => ctx.measureText(e.name).width));
    const boxWidth = pad * 2 + swatch + gap + widest;
    const boxHeight = pad * 2 + rowHeight * entries.length - (rowHeight - size);
    ctx.fillStyle = PLATE;
    ctx.fillRect(pad, pad, boxWidth, boxHeight);
    entries.forEach((entry, i) => {
        const y = pad * 2 + i * rowHeight;
        ctx.fillStyle = entry.colour;
        ctx.fillRect(pad * 2, y, swatch, size);
        ctx.fillStyle = TEXT;
        ctx.fillText(entry.name, pad * 2 + swatch + gap, y + size / 2);
    });
    ctx.restore();
}
