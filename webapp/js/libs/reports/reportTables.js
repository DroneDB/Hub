// @ts-check
/**
 * The text of the values of a report: what an item measures, where it is, the fields it has, as the tables and the
 * item pages show them. Every string is made here, once, so that the live page and the PDF write the same.
 *
 * @typedef {object} TextContext
 * @property {string} units  'metric' or 'imperial'
 * @property {import('./reportSettings').AnnotationSchema} schema
 * @property {string} currency  the currency of a stockpile that names none
 * @property {{ name: string, project: (lonLat: number[]) => number[] | null } | null} [projection]  the CRS of the first
 *   report layer when it is projected: a points table gives the coordinates in it too
 *
 * @typedef {{ key: string, label: string, align: 'left' | 'right' }} TableColumn
 * @typedef {{ itemId: string, anchor: string | null, cells: Record<string, string>, note: string | null, marks?: ReturnType<typeof rowMarks> }} TableRow
 * @typedef {{ type: 'table', id: string, title: string, columns: TableColumn[], rows: TableRow[] }} TableBlock
 */
import {
    EMPTY_CELL, formatLength, formatArea, formatVolume, formatWeight, formatMoney, formatNumber, formatDate,
    latLonText, normalizeCurrency
} from '@/libs/format';
import { choiceLabel } from '@/libs/map/annotationIds';
import { baseMethodName } from '@/libs/stockpileBase';
import { KIND_ORDER, KIND_LABELS, KIND_SINGULAR, OWNER_TAGS } from '@/libs/reports/reportKinds';
import { rowMarks } from '@/libs/reports/reportStyling';

/** What the row of a 3D item says when it has no place on a map. */
export const NOT_GEOREFERENCED = 'Not georeferenced';

const LEFT = /** @type {const} */ ('left');
const RIGHT = /** @type {const} */ ('right');

/** @param {string} key @param {string} label @param {'left' | 'right'} [align] @returns {TableColumn} */
const column = (key, label, align = LEFT) => ({ key, label, align });

/** A due date as the locale writes it. It is a calendar date: it is read as one, not as midnight UTC. @param {string | null} dueDate */
export function dueDateText(dueDate) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dueDate ?? '');
    return match ? formatDate(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : EMPTY_CELL;
}

/**
 * The value of an annotation field by name: its name in the schema, `Unknown (<id>)` for an id the schema does not
 * have, an en dash for none.
 * @param {import('./reportItems').ReportItem} item
 * @param {'category' | 'severity' | 'status'} field
 * @param {TextContext} ctx
 */
export function fieldText(item, field, ctx) {
    const lists = /** @type {Record<string, { id: string, name: string }[]>} */ ({ category: ctx.schema.categories, severity: ctx.schema.severities, status: ctx.schema.statuses });
    return choiceLabel(lists[field], item[field]) || EMPTY_CELL;
}

/** The status, with "(overdue)" after it for an item that is. @param {import('./reportItems').ReportItem} item @param {TextContext} ctx */
export function statusText(item, ctx) {
    const status = fieldText(item, 'status', ctx);
    return item.overdue ? `${status} (overdue)` : status;
}

/** The text of a value in metres or square metres, or what the item was saved with when its unit cannot be converted. */
const orRaw = (/** @type {import('./reportItems').ReportItem} */ item, /** @type {'distance' | 'area' | 'perimeter' | 'radius' | 'circumference'} */ stored, /** @type {number | null} */ value, /** @type {(v: number) => string} */ format) => {
    if (value !== null) return format(value);
    const raw = item.properties[stored];
    return item.measured.unconvertible && typeof raw === 'number' ? `${formatNumber(raw, 2, { trim: true })} ${item.properties.unit ?? ''}`.trim() : EMPTY_CELL;
};

/** @param {import('./reportItems').ReportItem} item @param {TextContext} ctx */
const lengthText = (item, ctx) => orRaw(item, 'distance', item.measured.length, v => formatLength(v, ctx.units));
/** @param {import('./reportItems').ReportItem} item @param {TextContext} ctx */
const areaText = (item, ctx) => orRaw(item, 'area', item.measured.area, v => formatArea(v, ctx.units));
/** @param {import('./reportItems').ReportItem} item @param {TextContext} ctx */
const perimeterText = (item, ctx) => orRaw(item, 'perimeter', item.measured.perimeter, v => formatLength(v, ctx.units));

/** @param {number | null | undefined} n */
const isNumber = n => typeof n === 'number' && Number.isFinite(n);

/**
 * Where a point is: its WGS84 coordinates ("latitude, longitude"), and in the CRS of the report layer when it is
 * projected; "Not georeferenced" for an item with no place on the map.
 * @param {import('./reportItems').ReportItem} item
 * @param {TextContext} ctx
 * @returns {{ coordinates: string, projected: string }}
 */
export function locationText(item, ctx) {
    const position = item.geometry?.type === 'Point' ? item.geometry.coordinates : null;
    if (!item.georeferenced || !position) return { coordinates: NOT_GEOREFERENCED, projected: NOT_GEOREFERENCED };
    const projected = ctx.projection?.project([position[0], position[1]]);
    return {
        coordinates: latLonText(position[1], position[0]),
        projected: projected ? projected.slice(0, 2).map(v => formatNumber(v, 2, { grouping: false })).join(', ') : EMPTY_CELL
    };
}

/** The stockpile figures of an item, as text. @param {import('./reportItems').ReportItem} item @param {TextContext} ctx */
function pileTexts(item, ctx) {
    const p = item.properties;
    const money = p.costEstimate && isNumber(p.costEstimate.amount)
        ? formatMoney(p.costEstimate.amount, normalizeCurrency(p.currency ?? p.costEstimate.currency ?? ctx.currency))
        : EMPTY_CELL;
    return {
        net: formatVolume(p.netVolume, ctx.units),
        cut: formatVolume(p.cutVolume, ctx.units),
        fill: formatVolume(p.fillVolume, ctx.units),
        base: typeof p.basePlaneMethod === 'string' ? baseMethodName(/** @type {any} */ (p.basePlaneMethod)) : EMPTY_CELL,
        material: typeof p.materialName === 'string' && p.materialName ? p.materialName : EMPTY_CELL,
        weight: isNumber(p.weightEstimate?.tons) ? formatWeight(p.weightEstimate.tons, ctx.units) : EMPTY_CELL,
        cost: money
    };
}

/** What a 3D circle or angle measures: its main value and the rest. @param {import('./reportItems').ReportItem} item @param {TextContext} ctx */
function measure3dTexts(item, ctx) {
    const m = item.measured;
    if (item.measurementType === 'angle') {
        return { measure: 'Angle', value: isNumber(m.angle) ? `${formatNumber(m.angle, 2, { trim: true })}°` : EMPTY_CELL, detail: '' };
    }
    const radius = orRaw(item, 'radius', m.radius, v => formatLength(v, ctx.units));
    const parts = [`Circumference ${orRaw(item, 'circumference', m.circumference, v => formatLength(v, ctx.units))}`, `Area ${areaText(item, ctx)}`];
    return { measure: 'Circle', value: `Radius ${radius}`, detail: parts.join(', ') };
}

/** The name of the measure a length is: a 3D distance or height, a 2D length. @param {import('./reportItems').ReportItem} item */
const lengthMeasure = item => (item.measurementType === 'height' ? 'Height' : item.measurementType === 'distance' ? 'Distance' : 'Length');

/**
 * The columns of the table of a kind and the cells of an item in it.
 * @type {Record<string, { id: string, columns: (ctx: TextContext) => TableColumn[], cells: (item: import('./reportItems').ReportItem, ctx: TextContext) => Record<string, string> }>}
 */
const KIND_TABLES = {
    point: {
        id: 'points',
        columns: ctx => [column('coordinates', 'Coordinates (WGS84)'), ...(ctx.projection ? [column('projected', `Coordinates (${ctx.projection.name})`)] : [])],
        cells: (item, ctx) => {
            const { coordinates, projected } = locationText(item, ctx);
            return { coordinates, ...(ctx.projection ? { projected } : {}) };
        }
    },
    length: {
        id: 'lengths',
        columns: () => [column('measure', 'Measure'), column('length', 'Value', RIGHT)],
        cells: (item, ctx) => ({ measure: lengthMeasure(item), length: lengthText(item, ctx) })
    },
    area: {
        id: 'areas',
        columns: () => [column('area', 'Area', RIGHT), column('perimeter', 'Perimeter', RIGHT)],
        cells: (item, ctx) => ({ area: areaText(item, ctx), perimeter: perimeterText(item, ctx) })
    },
    volume: {
        id: 'volumes',
        columns: () => [column('cut', 'Cut', RIGHT), column('fill', 'Fill', RIGHT), column('net', 'Net volume', RIGHT), column('base', 'Base'),
            column('material', 'Material'), column('weight', 'Weight', RIGHT), column('cost', 'Cost', RIGHT)],
        cells: (item, ctx) => {
            const { cut, fill, net, base, material, weight, cost } = pileTexts(item, ctx);
            return { cut, fill, net, base, material, weight, cost };
        }
    },
    profile: {
        id: 'profiles',
        columns: () => [column('length', 'Length', RIGHT)],
        cells: (item, ctx) => ({ length: lengthText(item, ctx) })
    },
    measure3d: {
        id: 'measures3d',
        columns: () => [column('measure', 'Measure'), column('value', 'Value', RIGHT), column('detail', 'Detail')],
        cells: (item, ctx) => measure3dTexts(item, ctx)
    }
};

/**
 * One table row of an item: its reference, name and type, the cells of its table, and the note a 3D item without a
 * place on the map carries.
 * @param {import('./reportItems').ReportItem} item
 * @param {Record<string, string>} cells
 * @returns {TableRow}
 */
function rowOf(item, cells, ctx) {
    return {
        itemId: item.id,
        // The colours of the category, severity and status cells, and whether the item is overdue
        marks: rowMarks(item, ctx.schema),
        anchor: item.numbered ? `#item-${item.id}` : null,
        cells: { ref: item.displayRef, name: item.name || EMPTY_CELL, type: OWNER_TAGS[item.owner], ...cells },
        note: item.owner === 'pointCloud' && !item.georeferenced ? NOT_GEOREFERENCED : null
    };
}

/** The columns every table starts with. @returns {TableColumn[]} */
const identityColumns = () => [column('ref', 'Ref'), column('name', 'Name'), column('type', 'Type')];

/**
 * The tables of a report: one for each kind that has items, in the order points, lengths, areas, volumes, profiles,
 * 3D measurements, then the punch list: the items that have a status.
 * @param {import('./reportItems').ReportItem[]} items  in the order of the report
 * @param {TextContext} ctx
 * @returns {TableBlock[]}
 */
export function buildTables(items, ctx) {
    /** @type {TableBlock[]} */
    const tables = [];
    for (const kind of KIND_ORDER) {
        const own = items.filter(i => i.kind === kind);
        if (!own.length) continue;
        const spec = KIND_TABLES[kind];
        tables.push({
            type: 'table',
            id: spec.id,
            title: KIND_LABELS[kind],
            columns: [...identityColumns(), ...spec.columns(ctx), column('category', 'Category'), column('status', 'Status')],
            rows: own.map(item => rowOf(item, { ...spec.cells(item, ctx), category: fieldText(item, 'category', ctx), status: statusText(item, ctx) }, ctx))
        });
    }
    const punch = items.filter(i => i.status);
    if (punch.length) {
        tables.push({
            type: 'table',
            id: 'punchList',
            title: 'Punch list',
            columns: [...identityColumns(), column('kind', 'Kind'), column('category', 'Category'), column('severity', 'Severity'),
                column('status', 'Status'), column('assignee', 'Assignee'), column('dueDate', 'Due')],
            rows: punch.map(item => rowOf(item, {
                kind: KIND_SINGULAR[item.kind],
                category: fieldText(item, 'category', ctx),
                severity: fieldText(item, 'severity', ctx),
                status: statusText(item, ctx),
                assignee: item.assignee ?? EMPTY_CELL,
                dueDate: dueDateText(item.dueDate)
            }, ctx))
        });
    }
    return tables;
}

/**
 * What an item pages says an item measures and is: label and value pairs, the same text as its table row.
 * @param {import('./reportItems').ReportItem} item
 * @param {TextContext} ctx
 * @returns {{ key: string, label: string, value: string }[]}
 */
export function itemRows(item, ctx) {
    /** @type {{ key: string, label: string, value: string }[]} */
    const rows = [
        { key: 'reference', label: 'Reference', value: item.displayRef },
        { key: 'name', label: 'Name', value: item.name || EMPTY_CELL },
        { key: 'kind', label: 'Kind', value: `${KIND_SINGULAR[item.kind]} (${OWNER_TAGS[item.owner]})` }
    ];
    const spec = KIND_TABLES[item.kind];
    const labels = new Map(spec.columns(ctx).map(c => [c.key, c.label]));
    for (const [key, value] of Object.entries(spec.cells(item, ctx))) {
        if (value !== '') rows.push({ key, label: labels.get(key) ?? key, value });
    }
    if (item.groupName || item.group) rows.push({ key: 'group', label: 'Group', value: item.groupName || item.group || EMPTY_CELL });
    rows.push(
        { key: 'category', label: 'Category', value: fieldText(item, 'category', ctx) },
        { key: 'severity', label: 'Severity', value: fieldText(item, 'severity', ctx) },
        { key: 'status', label: 'Status', value: statusText(item, ctx) },
        { key: 'assignee', label: 'Assignee', value: item.assignee ?? EMPTY_CELL },
        { key: 'dueDate', label: 'Due date', value: dueDateText(item.dueDate) }
    );
    return rows;
}
