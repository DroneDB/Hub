// @ts-check
/**
 * The items of a report: the annotations of its source files that its filter lets through, in the order of
 * the report (by source, then by reference in natural order, the unnumbered ones last), each with the
 * display reference the report shows (`<label>-<ref>` when the report has more than one source), whether it
 * is georeferenced and whether it is overdue. No formatting here: the sections turn the items into text.
 *
 * @typedef {object} ReportItem
 * @property {string} id
 * @property {string} ref  '' while the file is not numbered
 * @property {boolean} numbered  it has a ref: only a numbered item has an anchor, a viewer action and a QR code
 * @property {string} displayRef  the reference every callout, row, page and entry shows (NO_REF unnumbered)
 * @property {string} sourceLabel
 * @property {number} sourceIndex
 * @property {string} file  the measurements file
 * @property {number} index  its position in the file
 * @property {string} owner  'map' or 'pointCloud'
 * @property {import('./reportKinds').MeasurementKind} kind
 * @property {string} measurementType
 * @property {string} name
 * @property {string} description  markdown
 * @property {string | null} group  the id of its group
 * @property {string} groupName
 * @property {string | null} category
 * @property {string | null} severity
 * @property {string | null} status
 * @property {string | null} assignee
 * @property {string | null} dueDate  YYYY-MM-DD
 * @property {boolean} overdue
 * @property {string | null} createdAt
 * @property {boolean} georeferenced  it has a geometry in WGS84
 * @property {any} geometry  GeoJSON in WGS84 when georeferenced, else null
 * @property {{ path: string, source?: string, pixel?: number[], caption?: string }[]} photos
 * @property {{ path: string, camera?: any, capturedAt: string | null } | null} snapshot  the capture of a 3D item
 * @property {string | null} pointCloudFile  the point cloud of the file of a 3D item
 * @property {import('./reportKinds').Measured} measured
 * @property {Record<string, any>} properties  as the file stores them
 */
import { passesFilter } from '@/libs/reports/reportDefinition';
import { idOf, refOf, inCreationOrder, duplicateRefs } from '@/libs/map/annotationIds';
import { VIEW, sectionOf, LEGACY_GEOMETRY } from '@/libs/map/measurementFormat';
import { kindOfFeature, measuredOf } from '@/libs/reports/reportKinds';
import { EMPTY_CELL } from '@/libs/format';

/** What an unnumbered item shows in place of a reference: the mark of a value that is not there. */
export const NO_REF = EMPTY_CELL;

const refCollator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** The natural order of references: 2 before 10, A-2 before A-10. @param {string} a @param {string} b */
export const compareRefs = (a, b) => refCollator.compare(a, b);

/** The local date of an instant as `YYYY-MM-DD`: what a due date is compared with. @param {Date} date */
export function localDateKey(date) {
    const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Whether an item is overdue: a status that is not closed and a due date before the date of the report. A status
 * the schema does not have (the schema changed) is not closed.
 * @param {{ status: string | null, dueDate: string | null }} item
 * @param {{ statuses?: { id: string, closed: boolean }[] }} schema
 * @param {string} today  `YYYY-MM-DD`
 */
export function isOverdue(item, schema, today) {
    if (!item.status || !item.dueDate) return false;
    const closed = (schema.statuses ?? []).find(s => s.id === item.status)?.closed === true;
    return !closed && item.dueDate < today;
}

/**
 * Whether the geometry of a feature is in WGS84. A 2D feature always is. A 3D one is when its file has a `crs`
 * member and does not say that its geometry is still the old one (`legacyGeometry`): otherwise its geometry holds
 * the local coordinates of its cloud and means nothing on a map.
 * @param {any} document  as measurementFormat reads it
 * @param {string} owner
 */
export function isGeoreferenced(document, owner) {
    if (owner === VIEW.MAP) return true;
    return !!document?.crs && !sectionOf(document, VIEW.POINT_CLOUD)[LEGACY_GEOMETRY];
}

/** @param {unknown} v @returns {string | null} */
const textOrNull = v => (typeof v === 'string' && v !== '' ? v : null);

/** @param {unknown} photos */
function photosOf(photos) {
    if (!Array.isArray(photos)) return [];
    return photos.filter(p => p && typeof p === 'object' && typeof p.path === 'string' && p.path)
        .map(p => ({ path: p.path, source: p.source, pixel: Array.isArray(p.pixel) ? p.pixel : undefined, caption: typeof p.caption === 'string' ? p.caption : undefined }));
}

/** @param {any} snapshot */
const snapshotOf = snapshot => (snapshot && typeof snapshot.path === 'string' && snapshot.path
    ? { path: snapshot.path, camera: snapshot.camera, capturedAt: typeof snapshot.capturedAt === 'string' && snapshot.capturedAt ? snapshot.capturedAt : null }
    : null);

/**
 * @typedef {object} SourceInput
 * @property {string} file
 * @property {string} [label]
 * @property {Record<string, any> | null} [document]  the file, parsed (measurementFormat.parse)
 * @property {string | { message?: string }} [error]  why it could not be read
 */

/** @param {SourceInput | undefined} source @returns {string} */
function failureOf(source) {
    if (!source) return 'The file was not loaded';
    if (typeof source.error === 'string') return source.error;
    if (source.error?.message) return source.error.message;
    return 'The file is empty or missing';
}

/**
 * The items of the sources of a definition.
 * @param {{ sources: { file: string, label: string }[], filter: any }} definition
 * @param {SourceInput[]} loaded  the sources as read; one is found by its file
 * @param {{ statuses?: { id: string, closed: boolean }[] }} schema
 * @param {string} today  `YYYY-MM-DD`
 * @returns {{ items: ReportItem[], failed: { label: string, file: string, error: string }[],
 *   duplicates: { label: string, refs: string[] }[], skipped: number }}
 *   `skipped`: features that are no measurement a report knows
 */
export function buildItems(definition, loaded, schema, today) {
    /** @type {ReportItem[]} */
    const items = [];
    /** @type {{ label: string, file: string, error: string }[]} */
    const failed = [];
    /** @type {{ label: string, refs: string[] }[]} */
    const duplicates = [];
    let skipped = 0;
    const prefixed = definition.sources.length > 1;

    definition.sources.forEach((source, sourceIndex) => {
        const input = loaded.find(s => s.file === source.file);
        const document = input?.document;
        if (!document || !Array.isArray(document.features)) {
            failed.push({ label: source.label, file: source.file, error: failureOf(input) });
            return;
        }
        const groups = new Map((Array.isArray(sectionOf(document, VIEW.MAP).groups) ? sectionOf(document, VIEW.MAP).groups : [])
            .filter((/** @type {any} */ g) => g && typeof g.id === 'string').map((/** @type {any} */ g) => [g.id, String(g.name ?? '')]));
        const pointCloudFile = textOrNull(sectionOf(document, VIEW.POINT_CLOUD).pointCloudFile);

        /** @type {ReportItem[]} */
        const own = [];
        document.features.forEach((/** @type {any} */ feature, /** @type {number} */ index) => {
            const info = kindOfFeature(feature);
            if (!info) {
                skipped++;
                return;
            }
            const props = feature.properties ?? {};
            if (props.report === false) return;
            const ref = refOf(feature);
            const georeferenced = isGeoreferenced(document, info.owner) && !!feature.geometry;
            const group = textOrNull(props.groupId);
            const item = /** @type {ReportItem} */ ({
                id: idOf(feature) || `${source.label}:${index}`,
                ref,
                numbered: ref !== '',
                displayRef: ref === '' ? NO_REF : prefixed ? `${source.label}-${ref}` : ref,
                sourceLabel: source.label,
                sourceIndex,
                file: source.file,
                index,
                owner: info.owner,
                kind: info.kind,
                measurementType: info.measurementType,
                name: typeof props.name === 'string' ? props.name : '',
                description: typeof props.description === 'string' ? props.description : '',
                group,
                groupName: group ? groups.get(group) ?? '' : '',
                category: textOrNull(props.category),
                severity: textOrNull(props.severity),
                status: textOrNull(props.status),
                assignee: textOrNull(props.assignee),
                dueDate: textOrNull(props.dueDate),
                overdue: false,
                createdAt: textOrNull(props.createdAt),
                georeferenced,
                geometry: georeferenced ? feature.geometry : null,
                photos: photosOf(props.photos),
                snapshot: info.owner === VIEW.POINT_CLOUD ? snapshotOf(props.snapshot) : null,
                pointCloudFile: info.owner === VIEW.POINT_CLOUD ? pointCloudFile : null,
                measured: measuredOf(info, feature),
                properties: props
            });
            item.overdue = isOverdue(item, schema, today);
            if (passesFilter(definition.filter, { group: item.group, category: item.category, severity: item.severity, status: item.status, kind: item.kind, owner: item.owner })) {
                own.push(item);
            }
        });

        const repeated = duplicateRefs(own.map(i => i.ref));
        if (repeated.length) duplicates.push({ label: source.label, refs: repeated });
        items.push(...inReportOrder(own));
    });
    return { items, failed, duplicates, skipped };
}

/**
 * The items of one source in the order of the report: the numbered ones by reference in natural order (a tie keeps
 * the order of the file), then the unnumbered ones in the order refs are issued in: ascending creation time, then
 * file order.
 * @param {ReportItem[]} items
 * @returns {ReportItem[]}
 */
function inReportOrder(items) {
    const numbered = items.filter(i => i.numbered).sort((a, b) => compareRefs(a.ref, b.ref) || a.index - b.index);
    const unnumbered = inCreationOrder(items.filter(i => !i.numbered).map(item => ({ feature: { properties: { createdAt: item.createdAt } }, index: item.index, item })));
    return [...numbered, ...unnumbered.map(entry => entry.item)];
}
