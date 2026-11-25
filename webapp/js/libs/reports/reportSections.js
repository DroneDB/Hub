// @ts-check
/**
 * The sections of a report model and their blocks. A block is plain data (text already formatted, nothing to
 * compute) that the live page and the PDF both draw:
 *
 *   logo          { type, source: 'template' | 'instance', url, alt }   the logo of the report, first on the cover
 *   heading       { type, level 1-3, text, anchor: 'item-<id>' | null, itemId, viewerUrl }
 *   keyValue      { type, rows: [{ label, value }] }
 *   table         { type, id, title, columns: [{ key, label, align }], rows: [{ itemId, anchor, cells, note }] }
 *   mapSnapshot   { type, kind: 'overview' | 'item', itemId, ref, items, extent, frame, layers, basemap, view,
 *                   coverDeleted, legend, alt, note }   a request: the renderer draws it; the cover and the overview have
 *                   none when no item is drawn and the cover view has no layer (it would be the whole world)
 *   chart         { type, chart: 'profile', itemId, ref, line, elevationLayer, units, note, alt }   a request too; units:
 *                   the report's, for the distances along the line
 *   capture3d     { type, itemId, ref, path, camera, capturedAt, text }   the capture of a 3D item, or "No 3D snapshot"
 *   photoGrid     { type, itemId, photos: [{ path, caption, source, pixel }] }
 *   markdown      { type, text }   markdown the renderer sanitises
 *   summaryStats  { type, total, overdue, headline, totals, groups: [{ key, title, counts }] }   the groups that have counts
 *   qr            { type, url, label }
 *   note          { type, tone: 'info' | 'warning', text }
 *   signOff       { type, byline, lines: [{ label }] }   byline: "Prepared by <name>", or empty
 */
import { EMPTY_CELL, formatDate } from '@/libs/format';
import { SECTION_LABELS } from '@/libs/reports/reportDefaults';
import { buildTables, itemRows } from '@/libs/reports/reportTables';
import { countByKind, countByChoice, itemCountText } from '@/libs/reports/reportTotals';
import { extentOf, frameOf } from '@/libs/reports/reportFrames';

export const NO_ELEVATION_LAYER = 'No elevation layer in the cover view';
export const NO_3D_SNAPSHOT = 'No 3D snapshot';
export const COVER_DELETED = 'The cover view was deleted';
export const NO_ITEMS = 'No items match the filter of this report';
/** Why a report has no overview map: nothing of it has a place on the earth */
export const NO_MAP = 'No item of this report has a position on the earth, so there is no map';
/** The coordinate system of a report whose items all have local coordinates only */
export const NOT_GEOREFERENCED = 'None: the items are not georeferenced';
/** What a photo of an item that cannot be shown is, on the page and in the PDF, with its path under it */
export const MISSING_PHOTO = 'Missing photo';

/**
 * The caption of a figure: what it shows, then what is to be said of it: the note of the model (a deleted cover view,
 * no elevation layer) and the note of the renderer (the basemap was left out, the render failed), each once (a renderer
 * can answer with the model's note).
 * @param {string} alt  @param {...(string | null | undefined)} notes
 */
export const figureCaption = (alt, ...notes) => [...new Set([alt, ...notes].filter(Boolean))].join(' - ');

/**
 * @typedef {import('./reportItems').ReportItem} ReportItem
 * @typedef {import('./reportTables').TextContext} TextContext
 * @typedef {{ path: string, hash: string, opacity: number, vizParams: Record<string, any> | null }} CoverLayer
 * @typedef {object} SectionContext
 * @property {any} definition
 * @property {import('./reportSettings').ReportTemplate} template
 * @property {{ source: 'template' | 'instance', url: string } | null} logo  the logo of the report (resolveLogo)
 * @property {TextContext} text
 * @property {ReportItem[]} items
 * @property {{ totals: import('./reportTotals').Total[], unconverted: number }} totals
 * @property {{ deleted: boolean, layers: CoverLayer[], basemap: string | null, view: any, elevation: { path: string, hash: string, vizParams: Record<string, any> | null } | null }} cover
 * @property {{ label: string, file: string, error: string }[]} failed
 * @property {{ label: string, refs: string[] }[]} duplicates
 * @property {string} datasetName
 * @property {Date} now
 * @property {{ reportUrl?: string, anchorUrl?: (item: ReportItem) => string, viewerUrl?: (item: ReportItem) => string | null }} links
 * @property {Record<string, { name?: string, builtAt?: any, crs?: string }>} layerInfo
 */

/** @param {SectionContext} ctx @param {ReportItem} item */
export const anchorUrlOf = (ctx, item) => (ctx.links.anchorUrl ? ctx.links.anchorUrl(item) : `${ctx.links.reportUrl ?? ''}#item-${item.id}`);

/** @param {ReportItem} item */
const anchorOf = item => (item.numbered ? `item-${item.id}` : null);

/** @param {string} text @returns {{ type: 'note', tone: 'info' | 'warning', text: string }} */
const warning = text => ({ type: 'note', tone: 'warning', text });

/** @param {SectionContext} ctx @param {ReportItem} item */
function colourOf(ctx, item) {
    return ctx.text.schema.categories.find(c => c.id === item.category)?.colour ?? ctx.template.primary;
}

/**
 * The items a snapshot draws: the ones that have a place on the map, each with the colour of its category.
 * @param {SectionContext} ctx
 */
export function drawnItems(ctx) {
    return ctx.items.filter(i => i.georeferenced && i.geometry)
        .map(i => ({ id: i.id, ref: i.displayRef, kind: i.kind, owner: i.owner, geometry: i.geometry, colour: colourOf(ctx, i), category: i.category }));
}

/** The legend of the category colours on the overview: the categories of the items drawn. @param {SectionContext} ctx @param {{ category: string | null }[]} drawn */
function legendOf(ctx, drawn) {
    const used = new Set(drawn.map(i => i.category));
    const entries = ctx.text.schema.categories.filter(c => used.has(c.id)).map(c => ({ id: c.id, name: c.name, colour: c.colour }));
    const others = drawn.filter(i => !ctx.text.schema.categories.some(c => c.id === i.category));
    return others.length ? [...entries, { id: null, name: 'Other', colour: ctx.template.primary }] : entries;
}

/**
 * The request of a snapshot of the report layers (the cover view's) with the items on them. An overview shows every
 * item drawn; an item snapshot is framed on its item, the other items being drawn too.
 * @param {SectionContext} ctx
 * @param {any[]} drawn  drawnItems
 * @param {ReportItem | null} item
 */
function mapSnapshot(ctx, drawn, item) {
    const geometries = item ? [item.geometry] : drawn.map(i => i.geometry);
    const extent = extentOf(geometries);
    const alt = item
        ? `Map of item ${item.displayRef}`
        : `Overview map of ${drawn.length} ${drawn.length === 1 ? 'item' : 'items'}${drawn.length ? `: ${drawn.map(i => i.ref).join(', ')}` : ''}`;
    return {
        type: /** @type {const} */ ('mapSnapshot'),
        kind: item ? 'item' : 'overview',
        itemId: item ? item.id : null,
        ref: item ? item.displayRef : null,
        items: drawn,
        extent,
        frame: frameOf(extent),
        layers: ctx.cover.layers,
        basemap: ctx.cover.basemap,
        view: ctx.cover.view,
        coverDeleted: ctx.cover.deleted,
        legend: item ? [] : legendOf(ctx, drawn),
        alt,
        note: ctx.cover.deleted ? `${COVER_DELETED}: the items are drawn on the basemap only` : null
    };
}

/**
 * Whether the overview map has something on the earth to show: an item drawn on it, or a layer of the cover view.
 * Without either it would be the basemap of the whole world, so it is left out.
 * @param {SectionContext} ctx @param {any[]} drawn  drawnItems
 */
const hasMap = (ctx, drawn) => drawn.length > 0 || ctx.cover.layers.length > 0;

/** The overview map of the items, or none when it would show nothing on the earth (hasMap). @param {SectionContext} ctx */
function overviewMap(ctx) {
    const drawn = drawnItems(ctx);
    return hasMap(ctx, drawn) ? [mapSnapshot(ctx, drawn, null)] : [];
}

/** @param {number} level @param {string} text */
const heading = (level, text) => ({ type: /** @type {const} */ ('heading'), level: /** @type {1 | 2 | 3} */ (level), text, anchor: null, itemId: null, viewerUrl: null });

/** The sections that a source that failed or a repeated ref concerns: notes for the summary. @param {SectionContext} ctx */
function problemNotes(ctx) {
    return [
        ...ctx.failed.map(f => warning(`Source ${f.label} (${f.file}) could not be read: ${f.error}`)),
        ...ctx.duplicates.map(d => warning(`Source ${d.label} uses the reference${d.refs.length > 1 ? 's' : ''} ${d.refs.join(', ')} more than once`)),
        ...(ctx.totals.unconverted ? [warning(`${ctx.totals.unconverted} 3D ${ctx.totals.unconverted === 1 ? 'value is' : 'values are'} in a unit that cannot be converted and ${ctx.totals.unconverted === 1 ? 'is' : 'are'} not in the totals`)] : [])
    ];
}

/**
 * The logo block of the cover: the logo of the template, named by the template, or the logo of the instance.
 * @param {{ source: 'template' | 'instance', url: string }} logo @param {import('./reportSettings').ReportTemplate} template
 */
const logoBlock = (logo, template) => ({
    type: /** @type {const} */ ('logo'), source: logo.source, url: logo.url,
    alt: logo.source === 'template' && template.name ? `${template.name} logo` : 'Logo'
});

/** @param {SectionContext} ctx */
function coverSection(ctx) {
    const { definition } = ctx;
    const rows = [
        ...(definition.preparedBy ? [{ label: 'Prepared by', value: definition.preparedBy }] : []),
        ...(definition.preparedFor ? [{ label: 'Prepared for', value: definition.preparedFor }] : []),
        { label: 'Date', value: formatDate(ctx.now) },
        { label: 'Dataset', value: ctx.datasetName || EMPTY_CELL }
    ];
    return [
        ...(ctx.logo ? [logoBlock(ctx.logo, ctx.template)] : []),
        heading(1, definition.title || definition.name),
        ...(definition.subtitle ? [heading(2, definition.subtitle)] : []),
        { type: /** @type {const} */ ('keyValue'), rows },
        ...(ctx.cover.deleted ? [warning(COVER_DELETED)] : []),
        ...overviewMap(ctx),
        ...(ctx.links.reportUrl ? [{ type: /** @type {const} */ ('qr'), url: ctx.links.reportUrl, label: 'Open the live report' }] : [])
    ];
}

/** @param {SectionContext} ctx */
function summarySection(ctx) {
    const { items, text } = ctx;
    const overdue = items.filter(i => i.overdue).length;
    const total = itemCountText(items.length);
    const groups = [
        { key: 'kind', title: 'By kind', counts: countByKind(items) },
        { key: 'category', title: 'By category', counts: countByChoice(items, 'category', text.schema.categories) },
        { key: 'severity', title: 'By severity', counts: countByChoice(items, 'severity', text.schema.severities) },
        { key: 'status', title: 'By status', counts: countByChoice(items, 'status', text.schema.statuses) }
    ];
    return [
        heading(1, SECTION_LABELS.summary),
        ...problemNotes(ctx),
        {
            type: /** @type {const} */ ('summaryStats'),
            total: { count: items.length, text: total },
            overdue: { count: overdue, text: itemCountText(overdue) },
            headline: overdue ? `${total} (${itemCountText(overdue)} overdue)` : total,
            totals: ctx.totals.totals,
            groups: groups.filter(group => group.counts.length)
        }
    ];
}

/** @param {SectionContext} ctx */
function overviewSection(ctx) {
    const map = overviewMap(ctx);
    return [
        heading(1, SECTION_LABELS.overview),
        ...(ctx.cover.deleted ? [warning(COVER_DELETED)] : []),
        ...(map.length ? map : [{ type: /** @type {const} */ ('note'), tone: /** @type {const} */ ('info'), text: NO_MAP }])
    ];
}

/** @param {SectionContext} ctx */
function tablesSection(ctx) {
    const tables = buildTables(ctx.items, ctx.text);
    return [heading(1, SECTION_LABELS.tables), ...(tables.length ? tables : [{ type: /** @type {const} */ ('note'), tone: /** @type {const} */ ('info'), text: NO_ITEMS }])];
}

/** The photos of an item, the capture of a 3D one, the map and the chart: what shows an item besides its values. @param {SectionContext} ctx @param {ReportItem} item @param {any[]} drawn */
function visualBlocks(ctx, item, drawn) {
    /** @type {any[]} */
    const blocks = [];
    if (item.georeferenced) blocks.push(mapSnapshot(ctx, drawn, item));
    if (item.owner === 'pointCloud') {
        blocks.push({
            type: 'capture3d', itemId: item.id, ref: item.displayRef,
            path: item.snapshot?.path ?? null, camera: item.snapshot?.camera ?? null, capturedAt: item.snapshot?.capturedAt ?? null, text: item.snapshot ? `3D snapshot of item ${item.displayRef}` : NO_3D_SNAPSHOT
        });
    }
    if (item.kind === 'profile' && item.geometry?.type === 'LineString') {
        blocks.push({
            type: 'chart', chart: 'profile', itemId: item.id, ref: item.displayRef,
            line: item.geometry.coordinates, elevationLayer: ctx.cover.elevation, units: ctx.text.units,
            note: ctx.cover.elevation ? null : NO_ELEVATION_LAYER,
            alt: `Elevation profile of item ${item.displayRef}`
        });
    }
    return blocks;
}

/** @param {SectionContext} ctx @param {ReportItem} item @param {any[]} drawn */
function itemPage(ctx, item, drawn) {
    const viewerUrl = item.numbered && ctx.links.viewerUrl ? ctx.links.viewerUrl(item) : null;
    return [
        { type: /** @type {const} */ ('heading'), level: /** @type {const} */ (2), text: `${item.displayRef} ${item.name}`.trim(), anchor: anchorOf(item), itemId: item.id, viewerUrl },
        { type: /** @type {const} */ ('keyValue'), rows: itemRows(item, ctx.text) },
        ...visualBlocks(ctx, item, drawn),
        ...(item.description ? [{ type: /** @type {const} */ ('markdown'), text: item.description }] : []),
        ...(item.photos.length ? [{ type: /** @type {const} */ ('photoGrid'), itemId: item.id, photos: item.photos.map(p => ({ path: p.path, caption: p.caption ?? '', source: p.source ?? '', pixel: p.pixel ?? null })) }] : []),
        ...(item.numbered ? [{ type: /** @type {const} */ ('qr'), url: anchorUrlOf(ctx, item), label: `Item ${item.displayRef}` }] : [])
    ];
}

/** @param {SectionContext} ctx */
function itemsSection(ctx) {
    const drawn = drawnItems(ctx);
    return [
        heading(1, SECTION_LABELS.items),
        ...(ctx.items.length ? ctx.items.flatMap(item => itemPage(ctx, item, drawn)) : [{ type: /** @type {const} */ ('note'), tone: /** @type {const} */ ('info'), text: NO_ITEMS }])
    ];
}

/** @param {{ path: string }[]} paths @param {SectionContext} ctx @param {string} id @param {string} title */
function layersTable(paths, ctx, id, title) {
    return {
        type: /** @type {const} */ ('table'), id, title,
        columns: [{ key: 'name', label: 'Name', align: /** @type {const} */ ('left') }, { key: 'path', label: 'File', align: /** @type {const} */ ('left') }, { key: 'built', label: 'Built', align: /** @type {const} */ ('left') }],
        rows: paths.map(({ path }) => {
            const info = ctx.layerInfo[path] ?? {};
            return { itemId: '', anchor: null, note: null, cells: { name: info.name || path.split('/').pop() || path, path, built: info.builtAt ? formatDate(info.builtAt, { placeholder: EMPTY_CELL }) : EMPTY_CELL } };
        })
    };
}

/** @param {SectionContext} ctx */
function notesSection(ctx) {
    const { definition, template } = ctx;
    const rasters = [...new Set(ctx.items.filter(i => i.kind === 'volume').map(i => i.properties.sourceRaster).filter(r => typeof r === 'string' && r))].map(path => ({ path }));
    const located = ctx.items.length === 0 || ctx.items.some(i => i.georeferenced);
    const crs = located ? ctx.text.projection?.name ?? 'WGS84' : NOT_GEOREFERENCED;
    return [
        heading(1, SECTION_LABELS.notes),
        ...(definition.notes ? [{ type: /** @type {const} */ ('markdown'), text: definition.notes }] : []),
        { type: /** @type {const} */ ('keyValue'), rows: [{ label: 'Units', value: ctx.text.units === 'metric' ? 'Metric' : 'Imperial' }, { label: 'Coordinate system', value: crs }] },
        ...(ctx.cover.layers.length ? [layersTable(ctx.cover.layers, ctx, 'layers', 'Report layers')] : []),
        ...(rasters.length ? [layersTable(rasters, ctx, 'sourceRasters', 'Stockpile source rasters')] : []),
        ...(template.disclaimer ? [{ type: /** @type {const} */ ('markdown'), text: template.disclaimer }] : []),
        { type: /** @type {const} */ ('signOff'), byline: definition.preparedBy ? `Prepared by ${definition.preparedBy}` : '', lines: [{ label: 'Name' }, { label: 'Signature' }, { label: 'Date' }] }
    ];
}

const BUILDERS = /** @type {Record<string, (ctx: SectionContext) => any[]>} */ ({
    cover: coverSection,
    summary: summarySection,
    overview: overviewSection,
    tables: tablesSection,
    items: itemsSection,
    notes: notesSection
});

/**
 * The sections the definition switches on, in its order.
 * @param {SectionContext} ctx
 * @returns {{ kind: string, title: string, blocks: any[] }[]}
 */
export function buildSections(ctx) {
    return /** @type {{ kind: string, enabled: boolean }[]} */ (ctx.definition.sections)
        .filter(s => s.enabled && BUILDERS[s.kind])
        .map(s => ({ kind: s.kind, title: /** @type {Record<string, string>} */ (SECTION_LABELS)[s.kind], blocks: BUILDERS[s.kind](ctx) }));
}
