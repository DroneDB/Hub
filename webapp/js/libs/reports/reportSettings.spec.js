/**
 * The report settings client: its requests, when a report falls back to the defaults (an endpoint that is
 * not there, never a refusal), and the rules the settings dialog checks before it asks.
 */
import { describe, it, expect, vi } from 'vitest';
import {
    DEFAULT_SCHEMA, DEFAULT_TEMPLATE, LIMITS, REPORT_SWATCHES, SECTION_KINDS, ID_PATTERN,
    datasetReportSettings, orgReportSettings, saveOrgReportSettings, uploadTemplateLogo, deleteTemplateLogo,
    templateLogoUrl, datasetTemplateLogoUrl, isEndpointMissing,
    idFromName, newTemplate, newSchemaEntry, canRemoveEntry, canAddEntry,
    isColour, readableTextOn, logoProblem, templateProblems, schemaProblems, settingsProblems,
    normalisePath, keyProblems, problemPathsOf, problemAt, cloneSettings
} from './reportSettings';
import { ApiError } from '@/libs/ddb/apiError';

const organization = (registry = {}) => ({ registry, org: 'acme' });
const dataset = (registry = {}) => ({ registry, baseApi: '/orgs/acme/ds/north' });
const valid = () => ({ templates: [cloneSettings(DEFAULT_TEMPLATE)], schema: cloneSettings(DEFAULT_SCHEMA) });

describe('the defaults', () => {
    it('hold the default schema of the Registry: five categories, four severities, three statuses', () => {
        expect(DEFAULT_SCHEMA.categories.map(c => c.id)).toEqual(['general', 'defect', 'observation', 'safety', 'stockpile']);
        expect(DEFAULT_SCHEMA.severities.map(c => c.id)).toEqual(['low', 'medium', 'high', 'critical']);
        expect(DEFAULT_SCHEMA.statuses.map(s => [s.id, s.closed])).toEqual([['open', false], ['in-progress', false], ['resolved', true]]);
    });

    it('hold the Standard template, with every section', () => {
        expect(DEFAULT_TEMPLATE).toMatchObject({ id: 'standard', name: 'Standard', logo: null, paper: 'A4', orientation: 'portrait' });
        expect(DEFAULT_TEMPLATE.defaultSections).toEqual(SECTION_KINDS);
    });

    it('are valid by their own rules, and use no orange', () => {
        expect(settingsProblems({ templates: [DEFAULT_TEMPLATE], schema: DEFAULT_SCHEMA })).toEqual({});
        const colours = [DEFAULT_TEMPLATE.primary, DEFAULT_TEMPLATE.accent, ...REPORT_SWATCHES,
            ...DEFAULT_SCHEMA.categories.map(c => c.colour), ...DEFAULT_SCHEMA.severities.map(c => c.colour)];
        for (const colour of colours) {
            const [r, g, b] = [1, 3, 5].map(i => parseInt(colour.slice(i, i + 2), 16));
            // Orange: red high, green in the middle, blue low (the yellow of the Hub has its green high)
            expect(r > 200 && g > 70 && g < 160 && b < 90, colour).toBe(false);
        }
    });

    it('are frozen, and a clone is not', () => {
        expect(Object.isFrozen(DEFAULT_SCHEMA.categories[0])).toBe(true);
        const copy = cloneSettings(DEFAULT_SCHEMA);
        copy.categories.push({ id: 'x', name: 'X', colour: '#000000' });
        expect(DEFAULT_SCHEMA.categories).toHaveLength(5);
    });
});

describe('datasetReportSettings', () => {
    it('reads the endpoint of the dataset', async () => {
        const answer = { templates: [{ id: 'acme' }], schema: DEFAULT_SCHEMA };
        const registry = { getRequest: vi.fn(async () => answer) };
        expect(await datasetReportSettings(dataset(registry))).toBe(answer);
        expect(registry.getRequest).toHaveBeenCalledWith('/orgs/acme/ds/north/report-settings');
    });

    it.each([[404], [0], [502], [503], [504]])('falls back to the defaults when the endpoint is missing or unreachable (%s)', async status => {
        const registry = { getRequest: vi.fn(async () => { throw new ApiError('x', status); }) };
        const result = await datasetReportSettings(dataset(registry));
        expect(result.schema).toEqual(DEFAULT_SCHEMA);
        expect(result.templates).toEqual([DEFAULT_TEMPLATE]);
        // What it returns is the caller's to edit
        expect(Object.isFrozen(result.templates[0])).toBe(false);
        expect(isEndpointMissing(new ApiError('x', status))).toBe(true);
    });

    it.each([[403], [401], [500]])('never falls back on a status that is not a missing endpoint (%s)', async status => {
        const registry = { getRequest: vi.fn(async () => { throw new ApiError('no', status); }) };
        await expect(datasetReportSettings(dataset(registry))).rejects.toMatchObject({ status });
        expect(isEndpointMissing(new ApiError('x', status))).toBe(false);
    });
});

describe('the organization endpoints', () => {
    it('reads without the cache, so the version is the current one', async () => {
        const registry = { getRequest: vi.fn(async () => ({ templates: [], schema: {}, version: 3 })) };
        expect((await orgReportSettings(organization(registry))).version).toBe(3);
        expect(registry.getRequest).toHaveBeenCalledWith('/orgs/acme/report-settings', { cache: false });
    });

    it('writes the templates, the schema and the version, and returns the answer', async () => {
        const body = { ...valid(), version: 4 };
        const registry = { putRequest: vi.fn(async (url, sent) => ({ ...sent, version: 5 })) };
        const saved = await saveOrgReportSettings(organization(registry), { ...body, extra: 'ignored' });
        expect(registry.putRequest).toHaveBeenCalledWith('/orgs/acme/report-settings', body);
        expect(saved.version).toBe(5);
    });

    it('uploads a logo as the multipart field "file" and reads the new version', async () => {
        const registry = { putFormData: vi.fn(async () => ({ logo: 'logo.png', version: 6 })) };
        const file = new File(['x'], 'logo.png', { type: 'image/png' });
        expect(await uploadTemplateLogo(organization(registry), 'standard', file)).toEqual({ logo: 'logo.png', version: 6 });
        const [url, form] = registry.putFormData.mock.calls[0];
        expect(url).toBe('/orgs/acme/report-settings/templates/standard/logo');
        expect(form.get('file')).toBeInstanceOf(File);
    });

    it('deletes a logo', async () => {
        const registry = { deleteRequest: vi.fn(async () => ({ version: 7 })) };
        expect(await deleteTemplateLogo(organization(registry), 'standard')).toEqual({ version: 7 });
        expect(registry.deleteRequest).toHaveBeenCalledWith('/orgs/acme/report-settings/templates/standard/logo');
    });

    it('lets a refusal through (403, 404, 409)', async () => {
        for (const status of [403, 404, 409]) {
            const registry = { putRequest: vi.fn(async () => { throw new ApiError('no', status); }) };
            await expect(saveOrgReportSettings(organization(registry), { ...valid(), version: 1 })).rejects.toMatchObject({ status });
        }
    });

    it('builds the logo addresses, with the version that makes them change', () => {
        expect(templateLogoUrl(organization(), 'standard')).toBe('/orgs/acme/report-settings/templates/standard/logo');
        expect(templateLogoUrl(organization(), 'standard', 3)).toBe('/orgs/acme/report-settings/templates/standard/logo?v=3');
        expect(datasetTemplateLogoUrl(dataset(), 'std', 'logo.png')).toBe('/orgs/acme/ds/north/report-settings/logo/std?v=logo.png');
        expect(datasetTemplateLogoUrl(dataset(), 'std')).toBe('/orgs/acme/ds/north/report-settings/logo/std');
    });

    it('encodes the organization and the template in the path', () => {
        expect(templateLogoUrl({ registry: {}, org: 'a b' }, 'x/y')).toBe('/orgs/a%20b/report-settings/templates/x%2Fy/logo');
    });
});

describe('ids', () => {
    it('are made from the name within the id rule', () => {
        expect(idFromName('In progress')).toBe('in-progress');
        expect(idFromName('Sécurité & santé')).toBe('securite-sante');
        expect(idFromName('snake_case name')).toBe('snake-case-name');
        expect(idFromName('x'.repeat(60))).toHaveLength(32);
        expect(idFromName('日本語')).toMatch(ID_PATTERN);
        expect(idFromName('   ')).toBe('');
    });

    it('are unique in their list, within 32 characters', () => {
        expect(idFromName('Safety', ['safety'])).toBe('safety-2');
        expect(idFromName('Safety', ['safety', 'safety-2'])).toBe('safety-3');
        const long = 'a'.repeat(40);
        const second = idFromName(long, ['a'.repeat(32)]);
        expect(second).toHaveLength(32);
        expect(second.endsWith('-2')).toBe(true);
        expect(second).toMatch(ID_PATTERN);
    });
});

describe('new entries', () => {
    it('a template is the defaults with its own name, id and no logo', () => {
        const template = newTemplate([DEFAULT_TEMPLATE], 'Safety audit');
        expect(template).toMatchObject({ id: 'safety-audit', name: 'Safety audit', logo: null, paper: 'A4' });
        expect(templateProblems(template)).toEqual({});
        expect(newTemplate([newTemplate([], 'New template')]).id).toBe('new-template-2');
    });

    it('a category takes the first swatch the list has not, a status is open', () => {
        const categories = [{ id: 'a', name: 'A', colour: REPORT_SWATCHES[0] }];
        expect(newSchemaEntry('categories', categories, 'B')).toEqual({ id: 'b', name: 'B', colour: REPORT_SWATCHES[1] });
        expect(newSchemaEntry('statuses', [], 'Blocked')).toEqual({ id: 'blocked', name: 'Blocked', closed: false });
    });

    it('count limits: the last category, status and template stay; a severity may all go', () => {
        expect(canRemoveEntry('categories', [1])).toBe(false);
        expect(canRemoveEntry('statuses', [1])).toBe(false);
        expect(canRemoveEntry('templates', [1])).toBe(false);
        expect(canRemoveEntry('severities', [1])).toBe(true);
        expect(canRemoveEntry('categories', [1, 2])).toBe(true);
        expect(canAddEntry('templates', new Array(20).fill(0))).toBe(false);
        expect(canAddEntry('statuses', new Array(9).fill(0))).toBe(true);
        expect(canAddEntry('statuses', new Array(10).fill(0))).toBe(false);
    });
});

describe('the rules', () => {
    it('colours are #rrggbb', () => {
        expect(isColour('#0070e0')).toBe(true);
        expect(isColour('#0070E0')).toBe(true);
        expect(isColour('#07e')).toBe(false);
        expect(isColour('blue')).toBe(false);
        expect(isColour(null)).toBe(false);
    });

    it('text on a fill is dark on a light colour and white on a dark one', () => {
        expect(readableTextOn('#ffffff')).toBe('#111827');
        expect(readableTextOn('#eab308')).toBe('#111827');
        expect(readableTextOn('#001122')).toBe('#ffffff');
        expect(readableTextOn('#0070e0')).toBe('#ffffff');
        expect(readableTextOn('nope')).toBe('#111827');
    });

    it('a logo is an image of a known type up to 512 KB', () => {
        expect(logoProblem({ type: 'image/png', size: 1000 })).toBeNull();
        expect(logoProblem({ type: 'image/svg+xml', size: LIMITS.logoBytes })).toBeNull();
        expect(logoProblem({ type: 'image/png', size: LIMITS.logoBytes + 1 })).toMatch(/512 KB/);
        expect(logoProblem({ type: 'image/gif', size: 10 })).toMatch(/PNG, JPEG, WebP or SVG/);
        expect(logoProblem(null)).toMatch(/Choose/);
    });

    it('a template: name 1 to 60, colours, paper, texts at their limits', () => {
        const t = cloneSettings(DEFAULT_TEMPLATE);
        expect(templateProblems(t)).toEqual({});
        expect(Object.keys(templateProblems({ ...t, name: '  ' }))).toEqual(['name']);
        expect(Object.keys(templateProblems({ ...t, name: 'x'.repeat(61) }))).toEqual(['name']);
        expect(templateProblems({ ...t, name: 'x'.repeat(60) })).toEqual({});
        expect(Object.keys(templateProblems({ ...t, id: 'Bad Id' }))).toEqual(['id']);
        expect(Object.keys(templateProblems({ ...t, primary: 'red', accent: '#12' })).sort()).toEqual(['accent', 'primary']);
        expect(Object.keys(templateProblems({ ...t, paper: 'A3', orientation: 'tilted' })).sort()).toEqual(['orientation', 'paper']);
        expect(Object.keys(templateProblems({ ...t, headerText: 'x'.repeat(201), footerText: 'x'.repeat(201), disclaimer: 'x'.repeat(5001) })).sort())
            .toEqual(['disclaimer', 'footerText', 'headerText']);
        expect(templateProblems({ ...t, headerText: 'x'.repeat(200), disclaimer: 'x'.repeat(5000) })).toEqual({});
        expect(Object.keys(templateProblems({ ...t, defaultSections: ['cover', 'weird'] }))).toEqual(['defaultSections']);
    });

    it('a schema: at least one category and one status, no severity needed, at most 50, 10 and 10', () => {
        const schema = cloneSettings(DEFAULT_SCHEMA);
        expect(schemaProblems(schema)).toEqual({});
        expect(schemaProblems({ ...schema, severities: [] })).toEqual({});
        expect(schemaProblems({ ...schema, categories: [] })).toHaveProperty('categories');
        expect(schemaProblems({ ...schema, statuses: [] })).toHaveProperty('statuses');
        const entries = n => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, name: `S${i}`, colour: '#000000' }));
        expect(schemaProblems({ ...schema, severities: entries(11) })).toHaveProperty('severities');
        expect(schemaProblems({ ...schema, severities: entries(10) })).toEqual({});
        expect(schemaProblems({ ...schema, categories: entries(51) })).toHaveProperty('categories');
    });

    it('a schema entry: name, id, colour; ids unique in their list, a status needs no colour', () => {
        const schema = cloneSettings(DEFAULT_SCHEMA);
        schema.categories[1].name = '';
        schema.categories[2].colour = 'x';
        schema.categories[3].id = schema.categories[0].id;
        schema.statuses[0].id = 'Not valid';
        expect(Object.keys(schemaProblems(schema)).sort()).toEqual(
            ['categories.1.name', 'categories.2.colour', 'categories.3.id', 'statuses.0.id']);
    });

    it('the settings: templates 1 to 20, ids unique across templates, paths by template index', () => {
        const settings = valid();
        expect(settingsProblems(settings)).toEqual({});
        expect(settingsProblems({ ...settings, templates: [] })).toHaveProperty('templates');
        const many = Array.from({ length: 21 }, (_, i) => ({ ...cloneSettings(DEFAULT_TEMPLATE), id: `t${i}`, name: `T${i}` }));
        expect(settingsProblems({ ...settings, templates: many })).toHaveProperty('templates');
        const twice = [cloneSettings(DEFAULT_TEMPLATE), cloneSettings(DEFAULT_TEMPLATE)];
        expect(Object.keys(settingsProblems({ ...settings, templates: twice }))).toEqual(['templates.1.id']);
        twice[1].id = 'second';
        twice[1].name = '';
        expect(Object.keys(settingsProblems({ ...settings, templates: twice }))).toEqual(['templates.1.name']);
    });
});

describe('what the Registry refuses with', () => {
    it('meets the paths of the dialog: indexes and case do not matter', () => {
        expect(normalisePath('Templates[0].Name')).toBe('templates.0.name');
        expect(normalisePath('$.schema.categories[2].colour')).toBe('schema.categories.2.colour');
    });

    it('keys the problems of the dialog the way they are looked up', () => {
        const keyed = keyProblems({ 'templates.0.headerText': 'Too long' });
        expect(problemAt(keyed, 'templates.0.headerText')).toBe('Too long');
        expect(problemAt(keyed, 'Templates[0].HeaderText')).toBe('Too long');
    });

    it('is read from the errors of the problem, by path, without the schema prefix', () => {
        const error = new ApiError('One or more validation errors occurred.', 400, {
            errors: { 'Templates[1].Name': ['Name is too long.'], 'Schema.Categories[0].Colour': ['Bad colour', 'Again'], Version: [''] }
        });
        const problems = problemPathsOf(error);
        expect(problems).toEqual({ 'templates.1.name': 'Name is too long.', 'categories.0.colour': 'Bad colour Again' });
        expect(problemAt(problems, 'templates.1.name')).toBe('Name is too long.');
        expect(problemAt(problems, 'Categories[0].colour')).toBe('Bad colour Again');
        expect(problemAt(problems, 'templates.0.name')).toBe('');
    });

    it('is empty for an error that names no setting', () => {
        expect(problemPathsOf(new ApiError('boom', 500))).toEqual({});
        expect(problemPathsOf(null)).toEqual({});
        expect(problemPathsOf({ errors: ['a'] })).toEqual({});
    });
});
