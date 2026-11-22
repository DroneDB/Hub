// @ts-check
/**
 * A report definition: what is stored in the dataset meta list `reports` (one item per report),
 * the rules it must meet, and the pure rules of its filter. It holds no numbers: a report reads
 * the measurement files again each time it opens.
 *
 * @typedef {{ file: string, label: string }} ReportSource
 * @typedef {{ groups: string[], categories: string[], severities: string[], statuses: string[], kinds: string[], owners: string[] }} ReportFilter
 * @typedef {{ viewId: string } | { viewState: import('@/libs/views/viewState').ViewState }} ReportCover
 * @typedef {{ kind: string, enabled: boolean }} ReportSection
 * @typedef {{
 *   uid?: string, version: number, name: string, templateId: string, title: string, subtitle: string,
 *   preparedBy: string, preparedFor: string, notes: string, sources: ReportSource[], filter: ReportFilter,
 *   cover: ReportCover|null, sections: ReportSection[], units: 'metric'|'imperial'|null,
 *   createdBy?: string, createdAt?: string, modifiedAt?: string
 * }} ReportDefinition
 */
import { validateState, isSafeLayerPath } from '@/libs/views/viewState';

export const DEFINITION_VERSION = 1;

export const SECTION_KINDS = Object.freeze(['cover', 'summary', 'overview', 'tables', 'items', 'notes']);
/** The measurement kinds a report groups its items into. */
export const MEASUREMENT_KINDS = Object.freeze(['point', 'length', 'area', 'volume', 'profile', 'measure3d']);
/** Who owns an annotation: the 2D map or the point cloud viewer. */
export const OWNERS = Object.freeze(['map', 'pointCloud']);
export const UNITS = Object.freeze(['metric', 'imperial']);

export const MAX_TEXT_LENGTH = 200;
export const MAX_NOTES_LENGTH = 10000;
export const MAX_FILTER_VALUE_LENGTH = 100;
export const MAX_SOURCE_LABEL_LENGTH = 3;
export const MAX_FILE_PATH_LENGTH = 1024;

const UID_PATTERN = /^r_[0-9a-z]{8}$/;
const ID_PATTERN = /^[a-z0-9-]{1,32}$/;
const LABEL_PATTERN = /^[A-Z0-9]{1,3}$/;

/** @param {unknown} x @returns {x is Record<string, any>} */
const isObject = x => !!x && typeof x === 'object' && !Array.isArray(x);
const isStringOfAtMost = /** @param {unknown} x @param {number} max */ (x, max) => typeof x === 'string' && x.length <= max;

/** The filter lists and the field of an item each one tests. */
const FILTER_FIELDS = /** @type {const} */ ({
    groups: 'group', categories: 'category', severities: 'severity', statuses: 'status', kinds: 'kind', owners: 'owner'
});

/** The values a filter list may hold, when they are a fixed set. @type {Record<string, readonly string[]>} */
const FILTER_SETS = { kinds: MEASUREMENT_KINDS, owners: OWNERS };

/** A filter that restricts nothing. @returns {ReportFilter} */
export function emptyFilter() {
    return { groups: [], categories: [], severities: [], statuses: [], kinds: [], owners: [] };
}

/**
 * Whether an item passes a filter: it passes every list. An empty list restricts nothing; an item
 * with no value for a field a non-empty list tests does not pass.
 * @param {Partial<ReportFilter>|null|undefined} filter
 * @param {{ group?: string|null, category?: string|null, severity?: string|null, status?: string|null, kind?: string|null, owner?: string|null }} item
 */
export function passesFilter(filter, item) {
    if (!filter) return true;
    return Object.entries(FILTER_FIELDS).every(([list, field]) => {
        const allowed = /** @type {Record<string, string[]|undefined>} */ (filter)[list];
        if (!allowed || allowed.length === 0) return true;
        const value = /** @type {Record<string, string|null|undefined>} */ (item)[field];
        return typeof value === 'string' && value !== '' && allowed.includes(value);
    });
}

/**
 * The label of the n-th source (1 for the first): A, B, ... Z, AA, AB, ... ZZ, AAA.
 * @param {number} n
 */
function labelAt(n) {
    let text = '';
    for (let rest = n; rest > 0; rest = Math.floor((rest - 1) / 26)) text = String.fromCharCode(65 + (rest - 1) % 26) + text;
    return text;
}

/**
 * The first label of the sequence A, B, C, ... that no source has.
 * @param {Iterable<string>} taken
 */
export function nextSourceLabel(taken) {
    const used = new Set(taken);
    for (let n = 1; ; n++) {
        const label = labelAt(n);
        if (!used.has(label)) return label;
    }
}

/**
 * The sources with one more file, under the next free label; the same sources when the file is
 * already one.
 * @param {ReportSource[]} sources @param {string} file
 * @returns {ReportSource[]}
 */
export function addSource(sources, file) {
    if (sources.some(s => s.file === file)) return sources;
    return [...sources, { file, label: nextSourceLabel(sources.map(s => s.label)) }];
}

/**
 * The sections of a new definition from its template's default sections: the template's own,
 * on and in its order, then the others off, so that each section can be switched on or off.
 * @param {readonly string[]|undefined} defaultSections
 * @returns {ReportSection[]}
 */
export function sectionsFromTemplate(defaultSections) {
    if (!Array.isArray(defaultSections)) return SECTION_KINDS.map(kind => ({ kind, enabled: true }));
    const wanted = [...new Set(defaultSections.filter(k => SECTION_KINDS.includes(k)))];
    return [
        ...wanted.map(kind => ({ kind, enabled: true })),
        ...SECTION_KINDS.filter(kind => !wanted.includes(kind)).map(kind => ({ kind, enabled: false }))
    ];
}

/**
 * A new definition. It starts empty (no source, no cover), which cannot be saved yet: the
 * editor fills those in. Its sections are copied from the template, which a later change of the
 * template does not touch. The store adds the uid and the audit fields when it saves.
 * @param {{ template?: { id?: string, defaultSections?: readonly string[] }, name?: string, sources?: string[], cover?: ReportCover|null, units?: 'metric'|'imperial'|null }} [options]
 *   sources are file paths, given the labels A, B, C...
 * @returns {ReportDefinition}
 */
export function newDefinition({ template, name = '', sources = [], cover = null, units = null } = {}) {
    return {
        version: DEFINITION_VERSION,
        name,
        templateId: template?.id ?? 'standard',
        title: '',
        subtitle: '',
        preparedBy: '',
        preparedFor: '',
        notes: '',
        sources: sources.reduce(/** @param {ReportSource[]} all @param {string} file */ (all, file) => addSource(all, file), []),
        filter: emptyFilter(),
        cover,
        sections: sectionsFromTemplate(template?.defaultSections),
        units
    };
}

/** @param {unknown} sources  @returns {string|null} */
function sourcesProblem(sources) {
    if (!Array.isArray(sources) || sources.length === 0) return 'at least one source is needed';
    const files = new Set();
    const labels = new Set();
    for (const s of sources) {
        if (!isObject(s)) return 'a source is not valid';
        if (!isStringOfAtMost(s.file, MAX_FILE_PATH_LENGTH) || !isSafeLayerPath(s.file)) return 'a source file path is not valid';
        if (typeof s.label !== 'string' || !LABEL_PATTERN.test(s.label)) return `a source label must be 1 to ${MAX_SOURCE_LABEL_LENGTH} characters, A to Z and 0 to 9`;
        if (files.has(s.file)) return 'a source file is listed twice';
        if (labels.has(s.label)) return 'a source label is used twice';
        files.add(s.file);
        labels.add(s.label);
    }
    return null;
}

/** @param {unknown} filter @returns {string|null} */
function filterProblem(filter) {
    if (!isObject(filter)) return 'the filter is not valid';
    for (const list of Object.keys(FILTER_FIELDS)) {
        const values = filter[list];
        if (!Array.isArray(values)) return `the filter ${list} are not a list`;
        const fixed = FILTER_SETS[list];
        for (const v of values) {
            if (!isStringOfAtMost(v, MAX_FILTER_VALUE_LENGTH) || v === '') return `a filter value of ${list} is not valid`;
            if (fixed && !fixed.includes(v)) return `"${v}" is not a value of the filter ${list}`;
        }
    }
    return null;
}

/** @param {unknown} cover @returns {string|null} */
function coverProblem(cover) {
    if (!isObject(cover)) return 'a cover view is needed';
    const hasId = cover.viewId !== undefined;
    const hasState = cover.viewState !== undefined;
    if (hasId === hasState) return 'the cover is either a saved view or a view state';
    if (hasId) return typeof cover.viewId === 'string' && cover.viewId.length >= 1 && cover.viewId.length <= 64 ? null : 'the cover view is not valid';
    const { error, newerVersion } = validateState(cover.viewState);
    if (error) return `the cover view state is not valid: ${error}`;
    return newerVersion ? 'the cover view state is of a later version' : null;
}

/** @param {unknown} sections @returns {string|null} */
function sectionsProblem(sections) {
    if (!Array.isArray(sections)) return 'the sections are not a list';
    const kinds = new Set();
    for (const s of sections) {
        if (!isObject(s) || typeof s.kind !== 'string' || !SECTION_KINDS.includes(s.kind)) return 'a section kind is not valid';
        if (typeof s.enabled !== 'boolean') return 'a section is not switched on or off';
        if (kinds.has(s.kind)) return 'a section is listed twice';
        kinds.add(s.kind);
    }
    return null;
}

/**
 * Why `data` is not a report definition that can be saved or shown, or null when it is. A
 * definition of a later version is not checked further: `newerVersion` says so. A definition
 * with no source or no cover is not valid: the editor refuses to save it.
 * @param {any} data
 * @returns {{ error: string|null, newerVersion: boolean }}
 */
export function validateDefinition(data) {
    const fail = /** @param {string} error */ error => ({ error, newerVersion: false });
    if (!isObject(data)) return fail('not an object');
    if (!Number.isInteger(data.version) || data.version < 1) return fail('no version');
    if (data.version > DEFINITION_VERSION) return { error: null, newerVersion: true };

    if (typeof data.uid !== 'string' || !UID_PATTERN.test(data.uid)) return fail('the uid is not valid');
    if (typeof data.templateId !== 'string' || !ID_PATTERN.test(data.templateId)) return fail('the template is not valid');
    for (const field of ['title', 'subtitle', 'preparedBy', 'preparedFor']) {
        if (!isStringOfAtMost(data[field], MAX_TEXT_LENGTH)) return fail(`the ${field} must be text of at most ${MAX_TEXT_LENGTH} characters`);
    }
    if (!isStringOfAtMost(data.notes, MAX_NOTES_LENGTH)) return fail(`the notes must be text of at most ${MAX_NOTES_LENGTH} characters`);

    const problem = sourcesProblem(data.sources) || filterProblem(data.filter) || coverProblem(data.cover) || sectionsProblem(data.sections);
    if (problem) return fail(problem);
    if (data.units !== null && !UNITS.includes(data.units)) return fail('the units are not valid');
    for (const field of ['createdBy', 'createdAt', 'modifiedAt']) {
        if (data[field] !== undefined && typeof data[field] !== 'string') return fail(`${field} is not text`);
    }
    return { error: null, newerVersion: false };
}
