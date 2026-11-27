// @ts-check
/**
 * The parts of a section of the report model, for a renderer that lays out a group of blocks together rather than one
 * block after the other: the cover is one part (its logo, title, facts, figures, map and QR code), each item page is one
 * part (its heading, facts, figures, description, photos and QR code), and every other block is a part of its own. The
 * live page and the PDF both lay out the same parts, so they agree on what belongs together.
 *
 * Pure: the blocks are the model's, unchanged, in their order; nothing is dropped (a block a part has no slot for is in
 * its `rest`, in order).
 */

/**
 * @typedef {object} CoverPart
 * @property {'cover'} type
 * @property {any | null} logo
 * @property {any | null} title     the level 1 heading
 * @property {any | null} subtitle  the level 2 heading
 * @property {any | null} facts     the keyValue block
 * @property {any | null} kpis
 * @property {any | null} map
 * @property {any | null} qr
 * @property {any[]} rest           notes and anything else, in order
 *
 * @typedef {object} ItemPart
 * @property {'item'} type
 * @property {any} heading
 * @property {any | null} facts
 * @property {any[]} figures        the map snapshot, the 3D capture and the chart, in order
 * @property {any | null} description  the markdown block
 * @property {any | null} photos    the photoGrid block
 * @property {any | null} qr
 * @property {any[]} rest
 *
 * @typedef {{ type: 'block', block: any }} BlockPart
 * @typedef {CoverPart | ItemPart | BlockPart} SectionPart
 */

const FIGURES = new Set(['mapSnapshot', 'capture3d', 'chart']);

/** @param {any[]} blocks @returns {CoverPart} */
function coverPart(blocks) {
    /** @type {CoverPart} */
    const part = { type: 'cover', logo: null, title: null, subtitle: null, facts: null, kpis: null, map: null, qr: null, rest: [] };
    for (const block of blocks) {
        if (block.type === 'logo' && !part.logo) part.logo = block;
        else if (block.type === 'heading' && block.level === 1 && !part.title) part.title = block;
        else if (block.type === 'heading' && block.level === 2 && !part.subtitle) part.subtitle = block;
        else if (block.type === 'keyValue' && !part.facts) part.facts = block;
        else if (block.type === 'kpis' && !part.kpis) part.kpis = block;
        else if (block.type === 'mapSnapshot' && !part.map) part.map = block;
        else if (block.type === 'qr' && !part.qr) part.qr = block;
        else part.rest.push(block);
    }
    return part;
}

/** @param {any} heading @returns {ItemPart} */
const itemPart = heading => ({ type: 'item', heading, facts: null, figures: [], description: null, photos: null, qr: null, rest: [] });

/** @param {ItemPart} part @param {any} block */
function addToItem(part, block) {
    if (block.type === 'keyValue' && !part.facts) part.facts = block;
    else if (FIGURES.has(block.type)) part.figures.push(block);
    else if (block.type === 'markdown' && !part.description) part.description = block;
    else if (block.type === 'photoGrid' && !part.photos) part.photos = block;
    else if (block.type === 'qr' && !part.qr) part.qr = block;
    else part.rest.push(block);
}

/** Whether a block is the heading of an item page. @param {any} block */
export const isItemHeading = block => block?.type === 'heading' && !!block.itemId;

/**
 * The parts of a section.
 * @param {{ kind: string, blocks: any[] }} section
 * @returns {SectionPart[]}
 */
export function sectionParts(section) {
    if (section.kind === 'cover') return [coverPart(section.blocks)];
    /** @type {SectionPart[]} */
    const parts = [];
    /** @type {ItemPart | null} */
    let item = null;
    for (const block of section.blocks) {
        if (isItemHeading(block)) {
            item = itemPart(block);
            parts.push(item);
        } else if (item) {
            addToItem(item, block);
        } else {
            parts.push({ type: 'block', block });
        }
    }
    return parts;
}

/**
 * The facts of an item that its heading does not show already (its reference and name are the heading, its category,
 * severity and status its badges).
 * @param {{ rows: { key?: string, label: string, value: string }[] } | null} facts
 * @returns {{ key?: string, label: string, value: string }[]}
 */
export function itemFacts(facts) {
    const shown = new Set(['reference', 'name', 'category', 'severity', 'status']);
    return (facts?.rows ?? []).filter(row => !row.key || !shown.has(row.key));
}
