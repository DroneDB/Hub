// @ts-check
/**
 * The report settings of an organization: the templates a report is made from and the annotation
 * schema (the categories, severities and statuses an annotation takes its values from).
 *
 * This is the one client of the Registry endpoints, the defaults the Registry answers with for an
 * organization that has stored nothing (`DEFAULT_SCHEMA`, `DEFAULT_TEMPLATE`: a Registry that
 * does not have the endpoints yet gets the Hub's copy; they live in reportDefaults, which the
 * report model imports without this client), and the pure rules the settings dialog
 * checks before it asks (the same limits the Registry enforces, so that a refusal at the field
 * comes without a request).
 *
 * A dataset reads the settings through its own endpoint (`datasetReportSettings`: whoever can read
 * the dataset can read them); the organization endpoints (`orgReportSettings` and the rest) are
 * for the members of the organization, and the writes for its administrators. Both take what the
 * Hub already has: `dataset` is `reg.Organization(org).Dataset(ds)`, `organization` is
 * `reg.Organization(org)`.
 */
import { PRIMARY } from '@/libs/palette';
import { slugFromName } from '@/libs/slug';
import { SECTION_KINDS } from '@/libs/reports/reportDefinition';
import { SECTION_LABELS, DEFAULT_SCHEMA, DEFAULT_TEMPLATE, cloneSettings } from '@/libs/reports/reportDefaults';

export { SECTION_KINDS, SECTION_LABELS, DEFAULT_SCHEMA, DEFAULT_TEMPLATE, cloneSettings };

/** @typedef {import('./reportDefaults').SchemaChoice} SchemaChoice */
/** @typedef {import('./reportDefaults').SchemaStatus} SchemaStatus */
/** @typedef {import('./reportDefaults').AnnotationSchema} AnnotationSchema */
/** @typedef {import('./reportDefaults').SectionKind} SectionKind */
/** @typedef {import('./reportDefaults').ReportTemplate} ReportTemplate */
/** @typedef {{ templates: ReportTemplate[], schema: AnnotationSchema }} ReportSettings */
/** @typedef {{ templates: ReportTemplate[], schema: AnnotationSchema, version: number }} OrgReportSettings */
/** @typedef {{ registry: any, org: string }} OrganizationRef  what `reg.Organization(slug)` is */
/** @typedef {{ registry: any, baseApi: string }} DatasetRef  what `reg.Organization(org).Dataset(ds)` is */

/** The three lists of the schema, with the words the dialog uses for one entry of each. */
export const SCHEMA_LISTS = Object.freeze([
    Object.freeze({ key: 'categories', label: 'Categories', single: 'category', hasColour: true, hasClosed: false }),
    Object.freeze({ key: 'severities', label: 'Severities', single: 'severity', hasColour: true, hasClosed: false }),
    Object.freeze({ key: 'statuses', label: 'Statuses', single: 'status', hasColour: false, hasClosed: true })
]);

/** What the Registry accepts (the settings are refused with 400 beyond these). */
export const LIMITS = Object.freeze({
    templates: Object.freeze({ min: 1, max: 20 }),
    categories: Object.freeze({ min: 1, max: 50 }),
    severities: Object.freeze({ min: 0, max: 10 }),
    statuses: Object.freeze({ min: 1, max: 10 }),
    name: Object.freeze({ min: 1, max: 60 }),
    headerText: 200,
    footerText: 200,
    disclaimer: 5000,
    /** Bytes of a logo */
    logoBytes: 512 * 1024
});

/** The id of a template or of an entry of the schema: it is part of a file name and of stored annotations. */
export const ID_PATTERN = /^[a-z0-9-]{1,32}$/;
const ID_MAX = 32;
const COLOUR_PATTERN = /^#[0-9a-f]{6}$/i;
export const PAPERS = Object.freeze(['A4', 'Letter']);
export const ORIENTATIONS = Object.freeze(['portrait', 'landscape']);
/** The image types a logo can have: the same list the logo upload offers and the Registry accepts. */
export const LOGO_TYPES = Object.freeze(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);

/**
 * The colours the settings offer: none of them is orange (the Hub has no orange), and each one reads
 * on white and, as a fill, takes white or dark text (`readableTextOn`).
 */
export const REPORT_SWATCHES = Object.freeze([
    PRIMARY[500],
    '#16a34a', // green
    '#dc2626', // red
    '#7c3aed', // purple
    '#0891b2', // cyan
    '#eab308', // yellow
    '#64748b', // slate
    '#1e293b'  // dark slate
]);

/** @returns {ReportSettings} */
function defaultSettings() {
    return { templates: [cloneSettings(DEFAULT_TEMPLATE)], schema: cloneSettings(DEFAULT_SCHEMA) };
}

/**
 * Whether a failed read of the settings says "this Registry has no such endpoint" (a Registry older than the
 * feature answers 404 for the route, a gateway in front of a restarting one 502 to 504, a network failure has
 * status 0): a report then uses the defaults. A refusal (403, 401) never does: whoever may not read the settings
 * must not get a report that looks as if the organization had none.
 * @param {unknown} error
 */
export function isEndpointMissing(error) {
    const status = /** @type {any} */ (error)?.status;
    return status === 0 || status === 404 || status === 502 || status === 503 || status === 504;
}

/**
 * The settings a report of this dataset is made with: the templates and the schema of its organization.
 * @param {DatasetRef} dataset
 * @returns {Promise<ReportSettings>}
 */
export async function datasetReportSettings(dataset) {
    try {
        return await dataset.registry.getRequest(`${dataset.baseApi}/report-settings`);
    } catch (e) {
        if (isEndpointMissing(e)) return defaultSettings();
        throw e;
    }
}

/** @param {OrganizationRef} organization */
const orgApi = organization => `/orgs/${encodeURIComponent(organization.org)}/report-settings`;

/** @param {OrganizationRef} organization @param {string} templateId */
const logoApi = (organization, templateId) => `${orgApi(organization)}/templates/${encodeURIComponent(templateId)}/logo`;

/**
 * The settings of an organization with their version: the one the next write sends back.
 * @param {OrganizationRef} organization
 * @returns {Promise<OrgReportSettings>}
 */
export function orgReportSettings(organization) {
    // The version must be the current one: never from the cache
    return organization.registry.getRequest(orgApi(organization), { cache: false });
}

/**
 * Writes the settings. A `version` that is not the current one is refused with 409 (someone else saved first),
 * an invalid setting with 400 (the problem lists the entries), a user that is not an administrator with 403.
 * The logo of a template is not part of the write: only the logo functions change it.
 * @param {OrganizationRef} organization
 * @param {OrgReportSettings} settings
 * @returns {Promise<OrgReportSettings>}
 */
export function saveOrgReportSettings(organization, { templates, schema, version }) {
    return organization.registry.putRequest(orgApi(organization), { templates, schema, version });
}

/**
 * The logo of a template that is stored (a template only in the open dialog has none to receive one: 404).
 * @param {OrganizationRef} organization
 * @param {string} templateId
 * @param {Blob} file  a PNG, JPEG, WebP or SVG of at most `LIMITS.logoBytes`
 * @returns {Promise<{ logo: string, version: number }>}
 */
export function uploadTemplateLogo(organization, templateId, file) {
    const form = new FormData();
    form.append('file', file);
    return organization.registry.putFormData(logoApi(organization, templateId), form);
}

/**
 * @param {OrganizationRef} organization
 * @param {string} templateId
 * @returns {Promise<{ version: number }>}
 */
export function deleteTemplateLogo(organization, templateId) {
    return organization.registry.deleteRequest(logoApi(organization, templateId));
}

/**
 * Where the logo of a template is, for an <img>: a member of the organization reads it here. `version` (the one of the
 * settings, or the asset name) makes the address change when the logo does, so that a browser never keeps an old one.
 * @param {OrganizationRef} organization
 * @param {string} templateId
 * @param {string | number} [version]
 */
export function templateLogoUrl(organization, templateId, version) {
    return withVersion(logoApi(organization, templateId), version);
}

/**
 * Where a reader of a dataset finds the logo of a template (the endpoint of the dataset, for whoever can read it).
 * @param {DatasetRef} dataset
 * @param {string} templateId
 * @param {string | number} [version]
 */
export function datasetTemplateLogoUrl(dataset, templateId, version) {
    return withVersion(`${dataset.baseApi}/report-settings/logo/${encodeURIComponent(templateId)}`, version);
}

/** @param {string} url @param {string | number | undefined} version */
function withVersion(url, version) {
    return version === undefined || version === null || version === '' ? url : `${url}?v=${encodeURIComponent(String(version))}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Ids
// ---------------------------------------------------------------------------------------------------------------

/** @param {unknown} id */
export const isValidId = id => typeof id === 'string' && ID_PATTERN.test(id);

/**
 * The id a new template or schema entry gets from its name: the slug of the Registry's generator, narrowed to
 * the id rule (no underscore, at most 32 characters), and made unique with a `-<n>` suffix.
 * @param {string | null | undefined} name
 * @param {Iterable<string>} [taken]  the ids of the same list
 * @returns {string}  '' for a blank name
 */
export function idFromName(name, taken = []) {
    if (typeof name !== 'string' || name.trim() === '') return '';
    let slug = slugFromName(name);
    // The slug generator pads a one-character name with '0' to its minimum length; an id may be one character
    if (slug.length === 2 && slug.endsWith('0') && !name.includes('0')) slug = slug.slice(0, 1);
    const base = slug.replace(/_/g, '-').replace(/-{2,}/g, '-').slice(0, ID_MAX).replace(/^-+|-+$/g, '') || '0';
    const used = new Set(taken);
    if (!used.has(base)) return base;
    for (let n = 2; ; n++) {
        const suffix = `-${n}`;
        const candidate = base.slice(0, ID_MAX - suffix.length).replace(/-+$/, '') + suffix;
        if (!used.has(candidate)) return candidate;
    }
}

// ---------------------------------------------------------------------------------------------------------------
// Entries the dialog adds
// ---------------------------------------------------------------------------------------------------------------

/**
 * The ids a new entry of a list, or one renamed before it is saved, may not take: those of the other entries of the
 * list, and every stored one. A stored entry removed in the dialog keeps its id until the removal is saved: a new
 * entry with that id would take over what the stored one has (the logo of a template, the annotations of a category).
 * @param {{ id: string }[]} entries  the entries of the list now
 * @param {Iterable<string>} savedIds  the ids of the list that are stored
 * @param {{ id: string } | null} [except]  the entry the id is for
 * @returns {string[]}
 */
export function takenIds(entries, savedIds, except = null) {
    return [...savedIds, ...entries.filter(e => e !== except).map(e => e.id)];
}

/**
 * A new template: the defaults, a name and the id that name gives.
 * @param {ReportTemplate[]} templates  the templates there are
 * @param {string} [name]
 * @param {Iterable<string>} [savedIds]  the ids of the stored templates (see takenIds)
 * @returns {ReportTemplate}
 */
export function newTemplate(templates, name = 'New template', savedIds = []) {
    return { ...cloneSettings(DEFAULT_TEMPLATE), name, id: idFromName(name, takenIds(templates, savedIds)) };
}

/**
 * A new entry of a schema list. A category or a severity starts in the first swatch no entry of the list has.
 * @param {'categories' | 'severities' | 'statuses'} key
 * @param {(SchemaChoice | SchemaStatus)[]} list  the entries of the list now
 * @param {string} [name]
 * @returns {SchemaChoice | SchemaStatus}
 */
export function newSchemaEntry(key, list, name = '') {
    const id = idFromName(name, list.map(e => e.id));
    if (key === 'statuses') return { id, name, closed: false };
    const used = new Set(/** @type {SchemaChoice[]} */ (list).map(e => e.colour.toLowerCase()));
    return { id, name, colour: REPORT_SWATCHES.find(c => !used.has(c)) ?? REPORT_SWATCHES[0] };
}

/**
 * Whether an entry may be removed from a list: the list keeps its minimum (a category and a status are what an
 * annotation takes its value from, so there is always at least one of each).
 * @param {'templates' | 'categories' | 'severities' | 'statuses'} key
 * @param {unknown[]} list
 */
export const canRemoveEntry = (key, list) => list.length > LIMITS[key].min;

/**
 * Whether an entry may be added to a list.
 * @param {'templates' | 'categories' | 'severities' | 'statuses'} key
 * @param {unknown[]} list
 */
export const canAddEntry = (key, list) => list.length < LIMITS[key].max;

// ---------------------------------------------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------------------------------------------

/** @param {unknown} value */
export const isColour = value => typeof value === 'string' && COLOUR_PATTERN.test(value);

/**
 * The text colour that reads on a fill: dark on a light colour, white on a dark one (WCAG relative luminance).
 * @param {string} colour  #rrggbb
 * @returns {'#ffffff' | '#111827'}
 */
export function readableTextOn(colour) {
    if (!isColour(colour)) return '#111827';
    const [r, g, b] = [1, 3, 5].map(i => {
        const c = parseInt(colour.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    // The crossover where white and the dark text have the same contrast
    return luminance > 0.179 ? '#111827' : '#ffffff';
}

/** @param {string} noun @param {unknown} value @param {number} min @param {number} max */
function nameProblem(noun, value, min, max) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (text.length < min) return `Enter a ${noun}`;
    if (text.length > max) return `The ${noun} is at most ${max} characters`;
    return null;
}

/** @param {unknown} value @param {number} max @param {string} label */
function textProblem(value, max, label) {
    return typeof value === 'string' && value.length > max ? `${label} is at most ${max} characters` : null;
}

/**
 * What is wrong with a logo file, or null: its type and its size (the Registry checks both again, and reads the
 * content, not the type the browser reports).
 * @param {{ type?: string, size?: number } | null | undefined} file
 * @returns {string | null}
 */
export function logoProblem(file) {
    if (!file) return 'Choose an image';
    if (!LOGO_TYPES.includes(file.type ?? '')) return 'The logo is a PNG, JPEG, WebP or SVG image';
    if ((file.size ?? 0) > LIMITS.logoBytes) return `The logo is at most ${LIMITS.logoBytes / 1024} KB`;
    return null;
}

/** @param {Record<string, string>} errors @param {string} path @param {string | null} message */
function put(errors, path, message) {
    if (message) errors[path] = message;
}

/**
 * The problems of one template, by field.
 * @param {ReportTemplate} template
 * @returns {Record<string, string>}  field -> message; empty when it is valid
 */
export function templateProblems(template) {
    /** @type {Record<string, string>} */
    const errors = {};
    put(errors, 'name', nameProblem('name', template.name, LIMITS.name.min, LIMITS.name.max));
    put(errors, 'id', isValidId(template.id) ? null : 'The id is 1 to 32 characters: lower-case letters, digits and dashes');
    put(errors, 'primary', isColour(template.primary) ? null : 'Choose a colour (#rrggbb)');
    put(errors, 'accent', isColour(template.accent) ? null : 'Choose a colour (#rrggbb)');
    put(errors, 'paper', PAPERS.includes(template.paper) ? null : 'Choose a paper size');
    put(errors, 'orientation', ORIENTATIONS.includes(template.orientation) ? null : 'Choose an orientation');
    put(errors, 'headerText', textProblem(template.headerText, LIMITS.headerText, 'The header text'));
    put(errors, 'footerText', textProblem(template.footerText, LIMITS.footerText, 'The footer text'));
    put(errors, 'disclaimer', textProblem(template.disclaimer, LIMITS.disclaimer, 'The disclaimer'));
    const sections = template.defaultSections;
    put(errors, 'defaultSections', Array.isArray(sections) && sections.every(s => SECTION_KINDS.includes(s)) ? null : 'Unknown section');
    return errors;
}

/**
 * The problems of the schema, by path (`categories`, `categories.2.name`, ...).
 * @param {AnnotationSchema} schema
 * @returns {Record<string, string>}
 */
export function schemaProblems(schema) {
    /** @type {Record<string, string>} */
    const errors = {};
    for (const { key, single, hasColour } of SCHEMA_LISTS) {
        const list = schema[key] ?? [];
        const { min, max } = LIMITS[key];
        if (list.length < min) errors[key] = `Keep at least ${min === 1 ? 'one' : min} ${single}`;
        else if (list.length > max) errors[key] = `At most ${max} ${key}`;
        /** @type {Map<string, number>} */
        const firstOf = new Map();
        list.forEach((entry, index) => {
            const at = `${key}.${index}`;
            put(errors, `${at}.name`, nameProblem('name', entry.name, LIMITS.name.min, LIMITS.name.max));
            if (!isValidId(entry.id)) errors[`${at}.id`] = 'The id is 1 to 32 characters: lower-case letters, digits and dashes';
            else if (firstOf.has(entry.id)) errors[`${at}.id`] = 'Another entry of this list has the same id';
            else firstOf.set(entry.id, index);
            if (hasColour && !isColour(/** @type {SchemaChoice} */ (entry).colour)) errors[`${at}.colour`] = 'Choose a colour (#rrggbb)';
        });
    }
    return errors;
}

/**
 * The problems of the settings, by path: `templates` (the count), `templates.0.name`, `categories.2.colour`, ...
 * @param {ReportSettings} settings
 * @returns {Record<string, string>}  empty when the settings are valid
 */
export function settingsProblems({ templates, schema }) {
    /** @type {Record<string, string>} */
    const errors = {};
    const { min, max } = LIMITS.templates;
    if (templates.length < min) errors.templates = 'Keep at least one template';
    else if (templates.length > max) errors.templates = `At most ${max} templates`;
    const seen = new Set();
    templates.forEach((template, index) => {
        for (const [field, message] of Object.entries(templateProblems(template))) errors[`templates.${index}.${field}`] = message;
        if (isValidId(template.id)) {
            if (seen.has(template.id)) errors[`templates.${index}.id`] = 'Another template has the same id';
            seen.add(template.id);
        }
    });
    return { ...errors, ...schemaProblems(schema) };
}

/**
 * The key of an error path, so that the Registry's (`Templates[0].Name`, `schema.categories[2].colour`) and the
 * dialog's (`templates.0.name`) meet: lower case, indexes as path segments, no `$.` root.
 * @param {string} path
 */
export function normalisePath(path) {
    return String(path).replace(/^\$\.?/, '').replace(/\[(\d+)\]/g, '.$1').replace(/^\./, '').toLowerCase();
}

/**
 * A map of problems keyed by the paths of `settingsProblems`, keyed as `problemAt` looks them up.
 * @param {Record<string, string>} problems
 * @returns {Record<string, string>}
 */
export const keyProblems = problems => Object.fromEntries(Object.entries(problems).map(([path, message]) => [normalisePath(path), message]));

/**
 * What a refusal (400) of the Registry says, by the path of the setting it names. The schema lists are also
 * keyed without their `schema.` prefix, as the dialog names them.
 * @param {unknown} error  the error a request threw (the problem body is on it: `errors`)
 * @returns {Record<string, string>}  normalised path -> the messages joined; empty when the error names no setting
 */
export function problemPathsOf(error) {
    const errors = /** @type {any} */ (error)?.errors;
    /** @type {Record<string, string>} */
    const result = {};
    if (!errors || typeof errors !== 'object' || Array.isArray(errors)) return result;
    for (const [member, value] of Object.entries(errors)) {
        const text = (Array.isArray(value) ? value : [value]).filter(m => typeof m === 'string' && m.trim() !== '').join(' ');
        if (!text) continue;
        const path = normalisePath(member).replace(/^schema\./, '');
        result[path] = result[path] ? `${result[path]} ${text}` : text;
    }
    return result;
}

/**
 * The message at a path, from a map keyed by normalised paths (`problemPathsOf`).
 * @param {Record<string, string>} problems
 * @param {string} path  `templates.0.name`
 * @returns {string}
 */
export const problemAt = (problems, path) => problems[normalisePath(path)] ?? '';
