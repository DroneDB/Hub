// @ts-check
/**
 * The report model: everything a report says, as plain data, built from a definition, the measurement files it
 * names, the settings of the organization and the cover view. No DOM and no map: the live page and the PDF both
 * draw this one model (so they have the same sections, the same items in the same order and the same text), and the
 * snapshots and charts in it are requests that their renderers answer.
 *
 * The rules that make it: libs/reports/reportKinds (what an annotation is to a report, what it measures),
 * reportItems (the filter, the order, the references), reportTotals, reportTables, reportSections (the blocks) and
 * reportFrames (where a snapshot looks).
 */
import { formatDate } from '@/libs/format';
import { DEFAULT_SCHEMA, DEFAULT_TEMPLATE } from '@/libs/reports/reportDefaults';
import { isElevationRaster } from '@/libs/map/rasterUnit';
import { buildItems, localDateKey } from '@/libs/reports/reportItems';
import { computeTotals } from '@/libs/reports/reportTotals';
import { buildSections, COVER_DELETED } from '@/libs/reports/reportSections';

/**
 * @typedef {object} ReportInput
 * @property {import('./reportDefinition').ReportDefinition} definition
 * @property {import('./reportItems').SourceInput[]} sources  the measurement files as read (a source of the definition
 *   is matched by its file; one that is not here, or has an `error`, is listed as unreadable)
 * @property {{ templates?: import('./reportSettings').ReportTemplate[], schema?: import('./reportSettings').AnnotationSchema }} [settings]
 * @property {{ state?: import('@/libs/views/viewState').ViewState | null, deleted?: boolean } | null} [coverView]  the cover
 *   view as it is now: its state, or `deleted` when the saved view the definition names is gone
 * @property {string | null} [brandingLogoUrl]  the logo of the instance, for a template with none
 * @property {'metric' | 'imperial'} [units]  the reader's (PREF.MEASURE_UNIT); the definition's own wins
 * @property {string} [currency]  the reader's (PREF.CURRENCY): the currency of a stockpile that names none
 * @property {Date} [now]  the generation time
 * @property {string} [datasetName]
 * @property {{ reportUrl?: string, anchorUrl?: (item: import('./reportItems').ReportItem) => string,
 *   viewerUrl?: (item: import('./reportItems').ReportItem) => string | null,
 *   templateLogoUrl?: (template: import('./reportSettings').ReportTemplate) => string }} [links]  addresses, made by the
 *   caller (the model knows no routes)
 * @property {Record<string, any>} [layerInfo]  by path: what libddb says of a layer (`bandCount`, `dataType`, ... for
 *   `isElevationRaster`), its `name`, `builtAt`
 * @property {{ name: string, project: (lonLat: number[]) => number[] | null } | null} [projection]  the CRS of the first
 *   layer when it is projected
 */

/** The notice of a report whose template is gone. @param {string} id @param {string} name */
export const templateMissingText = (id, name) => `Template ${id} no longer exists; this report uses ${name}`;

/**
 * The template of a report: the one it names, else the first of the organization.
 * @param {import('./reportSettings').ReportTemplate[] | undefined} templates
 * @param {string} id
 * @returns {{ template: import('./reportSettings').ReportTemplate, missing: boolean }}
 */
export function resolveTemplate(templates, id) {
    const list = templates && templates.length ? templates : [DEFAULT_TEMPLATE];
    const found = list.find(t => t.id === id);
    return found ? { template: found, missing: false } : { template: list[0], missing: true };
}

/**
 * The logo of a report: the one of its template, else the one of the instance, else none.
 * @param {import('./reportSettings').ReportTemplate} template
 * @param {string | null | undefined} brandingLogoUrl
 * @param {ReportInput['links']} links
 * @returns {{ source: 'template' | 'instance', url: string } | null}
 */
export function resolveLogo(template, brandingLogoUrl, links) {
    if (template.logo && links?.templateLogoUrl) return { source: 'template', url: links.templateLogoUrl(template) };
    return brandingLogoUrl ? { source: 'instance', url: brandingLogoUrl } : null;
}

/**
 * What the cover view gives the snapshots: its visible layers in order with their settings, the basemap, the
 * position, and the first elevation layer (the one the profile charts are sampled from). A cover view that was
 * deleted gives no layer: the items are drawn on the basemap only.
 * @param {ReportInput['coverView']} coverView
 * @param {Record<string, any>} layerInfo
 */
export function resolveCover(coverView, layerInfo) {
    const deleted = !!coverView?.deleted;
    const state = deleted ? null : coverView?.state ?? null;
    const all = state?.layers ?? [];
    const pick = (/** @type {any} */ l) => ({ path: l.path, hash: l.hash ?? '', opacity: l.opacity ?? 1, vizParams: l.vizParams ?? null });
    const elevation = all.find(l => isElevationRaster(layerInfo[l.path]));
    return {
        deleted,
        layers: all.filter(l => l.visible !== false).map(pick),
        basemap: state?.display?.basemap ?? null,
        view: state?.view ?? null,
        elevation: elevation ? { path: elevation.path, hash: elevation.hash ?? '', vizParams: elevation.vizParams ?? null } : null
    };
}

/**
 * The report model.
 * @param {ReportInput} input
 */
export function buildReportModel(input) {
    const { definition } = input;
    const now = input.now ?? new Date();
    const links = input.links ?? {};
    const layerInfo = input.layerInfo ?? {};
    const schema = input.settings?.schema ?? DEFAULT_SCHEMA;
    const { template, missing } = resolveTemplate(input.settings?.templates, definition.templateId);
    const units = definition.units ?? input.units ?? 'metric';
    const currency = input.currency ?? 'USD';

    const { items, failed, duplicates } = buildItems(definition, input.sources ?? [], schema, localDateKey(now));
    const totals = computeTotals(items, units, currency);
    const cover = resolveCover(input.coverView, layerInfo);
    const text = { units, schema, currency, projection: input.projection ?? null };
    const logo = resolveLogo(template, input.brandingLogoUrl, links);

    const sections = buildSections({
        definition, template, logo, text, items, totals, cover, failed, duplicates, links, layerInfo,
        datasetName: input.datasetName ?? '', now
    });

    /** @type {{ code: string, text: string }[]} */
    const notices = [
        ...(missing ? [{ code: 'templateMissing', text: templateMissingText(definition.templateId, template.name) }] : []),
        ...(cover.deleted ? [{ code: 'coverDeleted', text: COVER_DELETED }] : []),
        ...failed.map(f => ({ code: 'sourceFailed', text: `Source ${f.label} (${f.file}) could not be read: ${f.error}` })),
        ...duplicates.map(d => ({ code: 'duplicateRef', text: `Source ${d.label} uses the reference${d.refs.length > 1 ? 's' : ''} ${d.refs.join(', ')} more than once` }))
    ];

    return {
        name: definition.name,
        title: definition.title || definition.name,
        template,
        templateMissing: missing,
        missingTemplateId: missing ? definition.templateId : null,
        logo,
        units,
        generatedAt: now.toISOString(),
        generatedDate: formatDate(now),
        datasetName: input.datasetName ?? '',
        coverDeleted: cover.deleted,
        sections,
        items,
        totals: totals.totals,
        failedSources: failed,
        notices
    };
}
