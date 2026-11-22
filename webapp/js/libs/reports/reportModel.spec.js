/**
 * The report model, section by section: what a report says for its sources, its template, its cover view and its
 * items, as the plain data both renderers draw.
 */
import { describe, it, expect } from 'vitest';
import { buildReportModel, resolveTemplate, resolveLogo, resolveCover, templateMissingText } from './reportModel';
import { newDefinition } from './reportDefinition';
import { DEFAULT_TEMPLATE, DEFAULT_SCHEMA, cloneSettings } from './reportSettings';
import { formatArea, formatLength, formatDate, EMPTY_CELL } from '@/libs/format';
import { geodesicArea } from '@/libs/map/geodesic';
import {
    square, mapFeature, cloudFeature, documentOf, template, settings, definitionOf, coverState, inputOf, blocksOf, NOW, DSM_INFO, ORTHO_INFO
} from './reportModel.fixtures';

const POINT = { type: 'Point', coordinates: [9.2, 45.1] };
const LINE = { type: 'LineString', coordinates: [[9.2, 45.1], [9.2005, 45.1005]] };

const tableOf = (model, id) => blocksOf(model, 'tables', 'table').find(t => t.id === id);

describe('the sections', () => {
    it('are the ones the definition switches on, in its order', () => {
        const definition = definitionOf(['a.geojson'], { sections: [{ kind: 'items', enabled: true }, { kind: 'cover', enabled: true }, { kind: 'summary', enabled: false }, { kind: 'notes', enabled: true }] });
        const model = buildReportModel(inputOf([mapFeature('p1', '1', 'point', POINT)], { definition }));
        expect(model.sections.map(s => s.kind)).toEqual(['items', 'cover', 'notes']);
        expect(model.sections.map(s => s.title)).toEqual(['Items', 'Cover', 'Notes']);
    });

    it('make a model that is plain data, the same each time it is built', () => {
        const input = inputOf([mapFeature('p1', '1', 'point', POINT), mapFeature('l1', '2', 'length', LINE)]);
        const first = buildReportModel(input);
        expect(JSON.parse(JSON.stringify(first))).toEqual(JSON.parse(JSON.stringify(buildReportModel(input))));
    });
});

describe('the cover section', () => {
    it('has the title, the people, the date, the dataset, an overview snapshot and the QR of the live page', () => {
        const definition = definitionOf(['a.geojson'], { title: 'Stockpile report', subtitle: 'North pit', preparedBy: 'J. Doe', preparedFor: 'Acme' });
        const model = buildReportModel(inputOf([mapFeature('p1', '1', 'point', POINT)], { definition }));
        const [title, subtitle, facts, snapshot, qr] = blocksOf(model, 'cover');
        expect(title).toMatchObject({ type: 'heading', level: 1, text: 'Stockpile report' });
        expect(subtitle).toMatchObject({ level: 2, text: 'North pit' });
        expect(facts.rows).toEqual([
            { label: 'Prepared by', value: 'J. Doe' }, { label: 'Prepared for', value: 'Acme' },
            { label: 'Date', value: formatDate(NOW) }, { label: 'Dataset', value: 'North pit dataset' }
        ]);
        expect(snapshot).toMatchObject({ type: 'mapSnapshot', kind: 'overview' });
        expect(qr).toEqual({ type: 'qr', url: 'https://hub.example/r/acme/north/reports/r_k3x9q2m7', label: 'Open the live report' });
    });

    it('uses the name when the report has no title, and leaves out the QR when the page has no address', () => {
        const definition = definitionOf(['a.geojson'], { title: '' });
        const model = buildReportModel(inputOf([], { definition, links: {} }));
        expect(model.title).toBe('North pit');
        expect(blocksOf(model, 'cover').map(b => b.type)).toEqual(['heading', 'keyValue', 'mapSnapshot']);
    });
});

describe('the logo', () => {
    it('is the logo of the template, else the one of the instance, else none', () => {
        const withLogo = template({ logo: 'report-logo-standard.png' });
        const links = { templateLogoUrl: t => `/logo/${t.id}` };
        expect(resolveLogo(withLogo, '/branding/logo.png', links)).toEqual({ source: 'template', url: '/logo/standard' });
        expect(resolveLogo(template(), '/branding/logo.png', links)).toEqual({ source: 'instance', url: '/branding/logo.png' });
        expect(resolveLogo(template(), null, links)).toBeNull();
        expect(resolveLogo(template(), '', {})).toBeNull();
    });

    it('is in the model', () => {
        const input = inputOf([], { brandingLogoUrl: '/branding/logo.png' });
        expect(buildReportModel(input).logo).toEqual({ source: 'instance', url: '/branding/logo.png' });
    });

    it('is the first block of the cover, named by the template whose logo it is', () => {
        const withLogo = template({ name: 'ACME', logo: 'report-logo-standard.png' });
        const model = buildReportModel(inputOf([], { settings: settings({ templates: [withLogo] }), links: { templateLogoUrl: t => `/logo/${t.id}` } }));
        expect(blocksOf(model, 'cover')[0]).toEqual({ type: 'logo', source: 'template', url: '/logo/standard', alt: 'ACME logo' });
        expect(blocksOf(model, 'cover')[1].type).toBe('heading');
    });

    it('is the logo of the instance on the cover when the template has none, and no block when there is no logo', () => {
        const model = buildReportModel(inputOf([], { brandingLogoUrl: '/branding/logo.png' }));
        expect(blocksOf(model, 'cover', 'logo')).toEqual([{ type: 'logo', source: 'instance', url: '/branding/logo.png', alt: 'Logo' }]);
        expect(blocksOf(buildReportModel(inputOf([])), 'cover', 'logo')).toEqual([]);
    });
});

describe('two sources', () => {
    const features2d = [mapFeature('m1', '1', 'point', POINT, { name: 'Gate' }), mapFeature('m2', '2', 'length', LINE, { name: 'Fence' })];
    const features3d = [cloudFeature('c1', '1', 'distance', LINE, { name: 'Crack', distance: 12.5, unit: 'm' })];
    const input = () => ({
        ...inputOf([]),
        definition: definitionOf(['a.geojson', 'b.geojson']),
        sources: [{ file: 'b.geojson', document: documentOf(features3d) }, { file: 'a.geojson', document: documentOf(features2d) }]
    });

    it('show the display reference <label>-<ref> everywhere, source A first whatever the order they were read in', () => {
        const model = buildReportModel(input());
        expect(model.items.map(i => i.displayRef)).toEqual(['A-1', 'A-2', 'B-1']);
        expect(tableOf(model, 'lengths').rows.map(r => r.cells.ref)).toEqual(['A-2', 'B-1']);
        expect(blocksOf(model, 'items', 'heading').filter(h => h.level === 2).map(h => h.text)).toEqual(['A-1 Gate', 'A-2 Fence', 'B-1 Crack']);
        const overview = blocksOf(model, 'overview', 'mapSnapshot')[0];
        expect(overview.items.map(i => i.ref)).toEqual(['A-1', 'A-2', 'B-1']);
        expect(overview.alt).toContain('A-1, A-2, B-1');
        expect(blocksOf(model, 'items', 'mapSnapshot').map(b => b.alt)).toEqual(['Map of item A-1', 'Map of item A-2', 'Map of item B-1']);
    });

    it('show the plain reference when the report has one source', () => {
        const model = buildReportModel(inputOf(features2d));
        expect(model.items.map(i => i.displayRef)).toEqual(['1', '2']);
    });

    it('list a source that cannot be read with its error, and report the others', () => {
        const model = buildReportModel({ ...input(), sources: [{ file: 'a.geojson', document: documentOf(features2d) }, { file: 'b.geojson', error: 'The file does not exist' }] });
        expect(model.items).toHaveLength(2);
        expect(model.failedSources).toEqual([{ label: 'B', file: 'b.geojson', error: 'The file does not exist' }]);
        expect(blocksOf(model, 'summary', 'note')[0]).toMatchObject({ tone: 'warning', text: 'Source B (b.geojson) could not be read: The file does not exist' });
        expect(model.notices.map(n => n.code)).toContain('sourceFailed');
    });

    it('list a source that was not given at all', () => {
        const model = buildReportModel({ ...input(), sources: [] });
        expect(model.failedSources.map(f => f.error)).toEqual(['The file was not loaded', 'The file was not loaded']);
    });
});

describe('the template', () => {
    it('is the one the report names', () => {
        const other = template({ id: 'site', name: 'Site report' });
        const definition = definitionOf(['a.geojson'], { templateId: 'site' });
        const model = buildReportModel(inputOf([], { definition, settings: settings({ templates: [template(), other] }) }));
        expect(model.template.id).toBe('site');
        expect(model.templateMissing).toBe(false);
        expect(model.notices).toEqual([]);
    });

    it('is the first one of the organization when the report names one that was deleted, with the flag and the notice', () => {
        const definition = definitionOf(['a.geojson'], { templateId: 'gone' });
        const first = template({ id: 'first', name: 'First', primary: '#16a34a' });
        const model = buildReportModel(inputOf([], { definition, settings: settings({ templates: [first, template({ id: 'second', name: 'Second' })] }) }));
        expect(model.template.id).toBe('first');
        expect(model.templateMissing).toBe(true);
        expect(model.missingTemplateId).toBe('gone');
        expect(model.notices).toEqual([{ code: 'templateMissing', text: 'Template gone no longer exists; this report uses First' }]);
        expect(templateMissingText('gone', 'First')).toBe(model.notices[0].text);
    });

    it('is the default template when the organization has none', () => {
        expect(resolveTemplate([], 'x')).toEqual({ template: DEFAULT_TEMPLATE, missing: true });
        expect(resolveTemplate(undefined, 'standard')).toEqual({ template: DEFAULT_TEMPLATE, missing: false });
    });

    it('does not change the sections of a report made before the template did', () => {
        const without = template({ defaultSections: ['cover', 'tables'] });
        const definition = { ...newDefinition({ template: without, name: 'R', sources: ['a.geojson'], cover: { viewId: 'v' } }), uid: 'r_k3x9q2m7' };
        const kinds = settings => buildReportModel(inputOf([mapFeature('p1', '1', 'point', POINT)], { definition, settings })).sections.map(s => s.kind);

        // The template, as the report was made from it, and after the administrator turned the other sections on
        expect(kinds(settings({ templates: [without] }))).toEqual(['cover', 'tables']);
        expect(kinds(settings({ templates: [template({ defaultSections: ['cover', 'summary', 'overview', 'tables', 'items', 'notes'] })] }))).toEqual(['cover', 'tables']);

        // A report made from the new template has them
        const fresh = newDefinition({ template: template(), name: 'R', sources: ['a.geojson'], cover: { viewId: 'v' } });
        expect(fresh.sections.filter(s => s.enabled).map(s => s.kind)).toHaveLength(6);
    });
});

describe('the cover view', () => {
    it('gives the snapshots its visible layers in order, with their settings, the basemap and the position', () => {
        const state = coverState({ dsm: true });
        state.layers[1].visible = false;
        state.display.basemap = 'osm';
        state.view = { center: [9, 45], zoom: 12, rotation: 0 };
        const cover = resolveCover({ state }, {});
        expect(cover).toMatchObject({
            deleted: false, basemap: 'osm', view: { center: [9, 45], zoom: 12, rotation: 0 },
            layers: [{ path: 'ortho.tif', hash: 'h1', opacity: 0.8, vizParams: { rescale: [0, 255] } }]
        });
        const model = buildReportModel(inputOf([mapFeature('p1', '1', 'point', POINT)], { coverView: { state } }));
        const snapshot = blocksOf(model, 'overview', 'mapSnapshot')[0];
        expect(snapshot).toMatchObject({ layers: cover.layers, basemap: 'osm', coverDeleted: false, note: null });
    });

    it('is drawn on the basemap only, with a notice, when the saved view was deleted', () => {
        const model = buildReportModel(inputOf([mapFeature('p1', '1', 'point', POINT)], { coverView: { state: null, deleted: true } }));
        expect(model.coverDeleted).toBe(true);
        expect(model.notices).toEqual([{ code: 'coverDeleted', text: 'The cover view was deleted' }]);
        const snapshots = [...blocksOf(model, 'cover', 'mapSnapshot'), ...blocksOf(model, 'overview', 'mapSnapshot'), ...blocksOf(model, 'items', 'mapSnapshot')];
        expect(snapshots).toHaveLength(3);
        for (const snapshot of snapshots) {
            expect(snapshot).toMatchObject({ layers: [], basemap: null, coverDeleted: true });
            expect(snapshot.note).toContain('The cover view was deleted');
            expect(snapshot.items).toHaveLength(1);
        }
        expect(blocksOf(model, 'cover', 'note')[0].text).toBe('The cover view was deleted');
    });

    it('draws no layer when no cover view was given', () => {
        expect(resolveCover(null, {})).toMatchObject({ deleted: false, layers: [], basemap: null, view: null, elevation: null });
    });
});

describe('a point cloud without a usable CRS', () => {
    const features = [
        mapFeature('m1', '1', 'point', POINT, { name: 'Gate' }),
        cloudFeature('c1', '2', 'point', { type: 'Point', coordinates: [583000, 4507000, 123] }, { name: 'Tower' }),
        cloudFeature('c2', '3', 'distance', { type: 'LineString', coordinates: [[0, 0, 0], [5, 0, 0]] }, { name: 'Crack', distance: 5, unit: 'm' })
    ];
    const make = (options = {}) => buildReportModel({ ...inputOf([]), sources: [{ file: 'a.geojson', document: documentOf(features, { crs: false, ...options }) }] });

    it('has its 3D items on no 2D snapshot, but its 2D items stay', () => {
        const model = make();
        expect(model.items.find(i => i.id === 'c1').georeferenced).toBe(false);
        for (const snapshot of [...blocksOf(model, 'cover', 'mapSnapshot'), ...blocksOf(model, 'overview', 'mapSnapshot')]) {
            expect(snapshot.items.map(i => i.id)).toEqual(['m1']);
        }
        const pages = blocksOf(model, 'items', 'mapSnapshot');
        expect(pages.map(b => b.itemId)).toEqual(['m1']);
    });

    it('shows "Not georeferenced" in place of the coordinates and as a note of every row', () => {
        const model = make();
        const points = tableOf(model, 'points').rows;
        expect(points.find(r => r.itemId === 'c1')).toMatchObject({ cells: { coordinates: 'Not georeferenced' }, note: 'Not georeferenced' });
        expect(points.find(r => r.itemId === 'm1').note).toBeNull();
        expect(tableOf(model, 'lengths').rows[0]).toMatchObject({ itemId: 'c2', note: 'Not georeferenced' });
        expect(tableOf(model, 'lengths').rows[0].cells.length).toBe(formatLength(5, 'metric'));
    });

    it('is the same for a file whose geometry is still the old one', () => {
        const model = make({ crs: true, legacyGeometry: true });
        expect(model.items.filter(i => !i.georeferenced).map(i => i.id)).toEqual(['c1', 'c2']);
    });

    it('is georeferenced with a CRS, and then is on the snapshots', () => {
        const model = buildReportModel({ ...inputOf([]), sources: [{ file: 'a.geojson', document: documentOf(features, { crs: true }) }] });
        expect(model.items.every(i => i.georeferenced)).toBe(true);
        expect(blocksOf(model, 'overview', 'mapSnapshot')[0].items.map(i => i.id)).toEqual(['m1', 'c1', 'c2']);
    });
});

describe('the 3D snapshot of an item', () => {
    const feature = (props = {}) => cloudFeature('c1', '1', 'distance', LINE, { distance: 3, unit: 'm', ...props });
    const capture = props => blocksOf(buildReportModel(inputOf([feature(props)])), 'items', 'capture3d')[0];

    it('is its capture with the camera it was taken from', () => {
        const snapshot = { path: 'survey/annotations/c1-3d.webp', camera: { position: [1, 2, 3], target: [4, 5, 6] } };
        expect(capture({ snapshot })).toMatchObject({ itemId: 'c1', ref: '1', path: snapshot.path, camera: snapshot.camera, capturedAt: null });
    });

    it('carries the time of the capture, for the address of its image', () => {
        const snapshot = { path: 'survey/annotations/c1-3d.webp', camera: { position: [1, 2, 3], target: [4, 5, 6] }, capturedAt: '2026-11-20T10:00:00.000Z' };
        expect(capture({ snapshot }).capturedAt).toBe('2026-11-20T10:00:00.000Z');
        expect(capture({ snapshot: { ...snapshot, capturedAt: 42 } }).capturedAt).toBeNull();
    });

    it('says "No 3D snapshot" when it has none', () => {
        expect(capture()).toMatchObject({ path: null, camera: null, text: 'No 3D snapshot' });
    });

    it('is not on a 2D item', () => {
        expect(blocksOf(buildReportModel(inputOf([mapFeature('p1', '1', 'point', POINT)])), 'items', 'capture3d')).toEqual([]);
    });
});

describe('the filter', () => {
    const features = [
        mapFeature('a', '1', 'point', POINT, { status: 'open', category: 'defect' }),
        mapFeature('b', '2', 'point', POINT, { status: 'resolved', category: 'defect' }),
        mapFeature('c', '3', 'length', LINE, { status: 'open', category: 'safety' }),
        mapFeature('d', '4', 'length', LINE)
    ];
    const withFilter = filter => {
        const definition = definitionOf(['a.geojson']);
        definition.filter = { ...definition.filter, ...filter };
        return buildReportModel(inputOf(features, { definition }));
    };

    it('keeps the open items, and the resolved ones are in no table, no item page and no snapshot', () => {
        const model = withFilter({ statuses: ['open'] });
        expect(model.items.map(i => i.id)).toEqual(['a', 'c']);
        for (const table of blocksOf(model, 'tables', 'table')) expect(table.rows.map(r => r.itemId)).not.toContain('b');
        expect(blocksOf(model, 'items', 'heading').filter(h => h.itemId).map(h => h.itemId)).toEqual(['a', 'c']);
        for (const snapshot of blocksOf(model, 'overview', 'mapSnapshot')) expect(snapshot.items.map(i => i.id)).toEqual(['a', 'c']);
        expect(blocksOf(model, 'summary', 'summaryStats')[0].total.count).toBe(2);
    });

    it('does not let through an item with no value for a list that is not empty', () => {
        expect(withFilter({ statuses: ['open', 'resolved'] }).items.map(i => i.id)).toEqual(['a', 'b', 'c']);
        expect(withFilter({ categories: ['defect'] }).items.map(i => i.id)).toEqual(['a', 'b']);
    });

    it('tests the kinds, the owners and the groups', () => {
        expect(withFilter({ kinds: ['length'] }).items.map(i => i.id)).toEqual(['c', 'd']);
        expect(withFilter({ owners: ['pointCloud'] }).items).toEqual([]);
        const grouped = [mapFeature('g', '1', 'point', POINT, { groupId: 'g1' }), mapFeature('h', '2', 'point', POINT)];
        const definition = definitionOf(['a.geojson']);
        definition.filter.groups = ['g1'];
        expect(buildReportModel(inputOf(grouped, { definition })).items.map(i => i.id)).toEqual(['g']);
    });

    it('says so when nothing is left', () => {
        const model = withFilter({ statuses: ['nope'] });
        expect(blocksOf(model, 'tables')[1]).toMatchObject({ type: 'note', text: 'No items match the filter of this report' });
        expect(blocksOf(model, 'items', 'note')[0].text).toBe('No items match the filter of this report');
    });

    it('leaves out an item that says report: false, whatever the filter', () => {
        const model = buildReportModel(inputOf([mapFeature('a', '1', 'point', POINT, { report: false }), mapFeature('b', '2', 'point', POINT)]));
        expect(model.items.map(i => i.id)).toEqual(['b']);
    });
});

describe('the totals', () => {
    const area2d = square(9.2, 45.1, 10);
    const features = [
        mapFeature('a2', '1', 'area', area2d, { name: 'Pad' }),
        cloudFeature('a3', '2', 'area', square(9.21, 45.1, 7), { name: 'Roof', area: 50, unit: 'm²' }),
        cloudFeature('h3', '3', 'height', { type: 'LineString', coordinates: [[9.2, 45.1, 0], [9.2, 45.1, 8]] }, { name: 'Pole', distance: 8, unit: 'm' }),
        cloudFeature('g3', '4', 'angle', { type: 'Point', coordinates: [9.2, 45.1, 0] }, { name: 'Slope', angle: 32.5, unit: 'degrees' }),
        mapFeature('l2', '5', 'length', LINE, { name: 'Fence' })
    ];
    const model = () => buildReportModel(inputOf(features));
    const stats = m => blocksOf(m, 'summary', 'summaryStats')[0];

    it('add a 2D area (geodesic) and a 3D area (as saved) into one area total tagged 2D and 3D', () => {
        const measured2d = geodesicArea(area2d.coordinates);
        expect(measured2d).toBeCloseTo(100, 0);
        const area = stats(model()).totals.find(t => t.key === 'area');
        expect(area.parts.map(p => [p.tag, p.count])).toEqual([['2D', 1], ['3D', 1]]);
        expect(area.parts[0].value).toBeCloseTo(measured2d, 6);
        expect(area.parts[1].value).toBe(50);
        expect(area.value).toBeCloseTo(measured2d + 50, 6);
        expect(area.text).toBe(formatArea(measured2d + 50, 'metric'));
        expect(area.text).toMatch(/^1[45]\d/);
        expect(area.partsText).toBe(`${area.parts[0].text} 2D, ${area.parts[1].text} 3D`);
    });

    it('show the two areas in the Areas table, tagged 2D and 3D', () => {
        const rows = tableOf(model(), 'areas').rows;
        expect(rows.map(r => [r.cells.ref, r.cells.type, r.cells.area])).toEqual([
            ['1', '2D', formatArea(geodesicArea(area2d.coordinates), 'metric')], ['2', '3D', formatArea(50, 'metric')]
        ]);
    });

    it('leave a height out of the length total, and keep it in the Lengths table', () => {
        const m = model();
        const length = stats(m).totals.find(t => t.key === 'length');
        expect(length.parts.map(p => [p.tag, p.count])).toEqual([['2D', 1]]);
        expect(length.partsText).toBe('');
        expect(length.count).toBe(1);
        expect(tableOf(m, 'lengths').rows.map(r => [r.cells.ref, r.cells.measure, r.cells.length])).toEqual([
            ['3', 'Height', formatLength(8, 'metric')], ['5', 'Length', formatLength(length.value, 'metric')]
        ]);
    });

    it('put an angle in the 3D measurements table, and in no total', () => {
        const m = model();
        const row = tableOf(m, 'measures3d').rows[0];
        expect(row.cells).toMatchObject({ ref: '4', type: '3D', measure: 'Angle' });
        expect(row.cells.value).toContain('32.5');
        expect(stats(m).totals.map(t => t.key)).toEqual(['length', 'area']);
    });

    it('are in the units of the report: the definition wins over the reader', () => {
        const imperial = buildReportModel(inputOf(features, { units: 'imperial' }));
        expect(stats(imperial).totals.find(t => t.key === 'length').text).toMatch(/ft$/);
        const definition = definitionOf(['a.geojson'], { units: 'metric' });
        const metric = buildReportModel(inputOf(features, { units: 'imperial', definition }));
        expect(metric.units).toBe('metric');
        expect(stats(metric).totals.find(t => t.key === 'length').text).toMatch(/ m$/);
    });

    it('convert a 3D value saved in feet, and leave out one in a unit that cannot be converted', () => {
        const feet = [cloudFeature('f', '1', 'distance', LINE, { distance: 100, unit: 'ft' }), cloudFeature('x', '2', 'distance', LINE, { distance: 10, unit: 'furlong' })];
        const m = buildReportModel(inputOf(feet));
        const length = stats(m).totals.find(t => t.key === 'length');
        expect(length.value).toBeCloseTo(30.48, 6);
        expect(length.count).toBe(1);
        expect(blocksOf(m, 'summary', 'note')[0].text).toContain('1 3D value is in a unit that cannot be converted');
        expect(tableOf(m, 'lengths').rows[1].cells.length).toBe('10 furlong');
    });
});

describe('the stockpiles', () => {
    const pile = (id, ref, extra) => mapFeature(id, ref, 'stockpile', square(9.2, 45.1, 20), {
        name: `Pile ${ref}`, netVolume: 1000, cutVolume: 1100, fillVolume: 100, basePlaneMethod: 'best_fit', materialName: 'Gravel',
        weightEstimate: { tons: 1680, basedOn: 'netVolume' }, costEstimate: { amount: 25200, currency: 'EUR' }, currency: 'EUR', ...extra
    });
    const features = [pile('s1', '1', {}), pile('s2', '2', { netVolume: 500, weightEstimate: { tons: 840 }, costEstimate: { amount: 12600, currency: 'EUR' } }),
        pile('s3', '3', { netVolume: 200, weightEstimate: { tons: 300 }, costEstimate: { amount: 1500, currency: 'USD' }, currency: 'USD' })];

    it('make the volumes table: cut, fill, net, base method, material, weight and cost', () => {
        const row = tableOf(buildReportModel(inputOf(features)), 'volumes').rows[0];
        expect(row.cells).toMatchObject({ ref: '1', type: '2D', base: 'Best-fit plane', material: 'Gravel' });
        expect(row.cells.net).toMatch(/1,?000(\.00)? m³/);
        expect(row.cells.cut).toMatch(/m³$/);
        expect(row.cells.cost).toContain('25,200');
    });

    it('add the net volume and the weight, and the cost per currency', () => {
        const totals = blocksOf(buildReportModel(inputOf(features)), 'summary', 'summaryStats')[0].totals;
        expect(totals.map(t => t.key)).toEqual(['volume', 'weight', 'cost', 'cost']);
        expect(totals[0].value).toBe(1700);
        expect(totals[1].value).toBe(2820);
        expect(totals.filter(t => t.key === 'cost').map(t => [t.currency, t.value])).toEqual([['EUR', 37800], ['USD', 1500]]);
    });

    it('use the currency of the reader for a pile that names none', () => {
        const unpriced = [pile('s1', '1', { currency: undefined, costEstimate: { amount: 100 } })];
        const totals = blocksOf(buildReportModel(inputOf(unpriced, { currency: 'GBP' })), 'summary', 'summaryStats')[0].totals;
        expect(totals.find(t => t.key === 'cost').currency).toBe('GBP');
    });

    it('show a dash for what a pile has no figure of', () => {
        const bare = mapFeature('s1', '1', 'stockpile', square(9.2, 45.1, 20), {});
        const row = tableOf(buildReportModel(inputOf([bare])), 'volumes').rows[0];
        expect(row.cells).toMatchObject({ net: EMPTY_CELL, weight: EMPTY_CELL, cost: EMPTY_CELL, material: EMPTY_CELL, base: EMPTY_CELL });
    });
});

describe('the profile chart', () => {
    const features = [mapFeature('p', '1', 'profile', { type: 'LineString', coordinates: [[9.2, 45.1], [9.201, 45.1], [9.202, 45.1]] }, { name: 'Section' })];
    const chartOf = model => blocksOf(model, 'items', 'chart')[0];

    it('is sampled from the first elevation layer of the cover view, and its snapshot draws the orthophoto with the cover opacity', () => {
        const model = buildReportModel(inputOf(features, { coverView: { state: coverState({ dsm: true }) }, layerInfo: { 'ortho.tif': ORTHO_INFO, 'dsm.tif': DSM_INFO } }));
        expect(chartOf(model)).toMatchObject({
            chart: 'profile', itemId: 'p', ref: '1', note: null, elevationLayer: { path: 'dsm.tif', hash: 'h2' },
            line: [[9.2, 45.1], [9.201, 45.1], [9.202, 45.1]]
        });
        const snapshot = blocksOf(model, 'items', 'mapSnapshot')[0];
        expect(snapshot.layers.map(l => [l.path, l.opacity])).toEqual([['ortho.tif', 0.8], ['dsm.tif', 0.5]]);
    });

    it('is in the units of the report: those of the definition, else those of the reader', () => {
        expect(chartOf(buildReportModel(inputOf(features, { units: 'imperial' }))).units).toBe('imperial');
        expect(chartOf(buildReportModel(inputOf(features, { units: 'metric', definition: { ...inputOf([]).definition, units: 'imperial' } }))).units).toBe('imperial');
        expect(chartOf(buildReportModel(inputOf(features))).units).toBe('metric');
    });

    it('takes the first of several elevation layers, also one the view hides', () => {
        const state = coverState({ dsm: true });
        state.layers.unshift({ ...state.layers[1], path: 'dtm.tif', hash: 'h3', visible: false });
        const model = buildReportModel(inputOf(features, { coverView: { state }, layerInfo: { 'dtm.tif': DSM_INFO, 'dsm.tif': DSM_INFO } }));
        expect(chartOf(model).elevationLayer.path).toBe('dtm.tif');
    });

    it('is replaced by "No elevation layer in the cover view" when the cover view has none', () => {
        const model = buildReportModel(inputOf(features, { layerInfo: { 'ortho.tif': ORTHO_INFO } }));
        expect(chartOf(model)).toMatchObject({ elevationLayer: null, note: 'No elevation layer in the cover view' });
        expect(chartOf(buildReportModel(inputOf(features))).note).toBe('No elevation layer in the cover view');
        expect(chartOf(buildReportModel(inputOf(features, { coverView: { state: null, deleted: true } }))).note).toBe('No elevation layer in the cover view');
    });

    it('is only on a profile', () => {
        expect(blocksOf(buildReportModel(inputOf([mapFeature('l', '1', 'length', LINE)])), 'items', 'chart')).toEqual([]);
    });
});

describe('the callouts', () => {
    it('are the references of the table rows, in natural order: 1 and 12 and 2 and 10', () => {
        const features = ['12', '2', '1', '10'].map(ref => mapFeature(`p${ref}`, ref, 'point', POINT));
        const model = buildReportModel(inputOf(features));
        const overview = blocksOf(model, 'overview', 'mapSnapshot')[0];
        expect(overview.items.map(i => i.ref)).toEqual(['1', '2', '10', '12']);
        expect(tableOf(model, 'points').rows.map(r => r.cells.ref)).toEqual(['1', '2', '10', '12']);
        expect(blocksOf(model, 'items', 'heading').filter(h => h.level === 2).map(h => h.text)).toEqual(['1', '2', '10', '12']);
    });

    it('have the colour of the category of the item, and the legend lists the categories drawn', () => {
        const features = [mapFeature('a', '1', 'point', POINT, { category: 'defect' }), mapFeature('b', '2', 'point', POINT, { category: 'safety' }), mapFeature('c', '3', 'point', POINT)];
        const overview = blocksOf(buildReportModel(inputOf(features)), 'overview', 'mapSnapshot')[0];
        const colours = Object.fromEntries(DEFAULT_SCHEMA.categories.map(c => [c.id, c.colour]));
        expect(overview.items.map(i => i.colour)).toEqual([colours.defect, colours.safety, DEFAULT_TEMPLATE.primary]);
        expect(overview.legend).toEqual([
            { id: 'defect', name: 'Defect', colour: colours.defect }, { id: 'safety', name: 'Safety', colour: colours.safety },
            { id: null, name: 'Other', colour: DEFAULT_TEMPLATE.primary }
        ]);
    });
});

describe('the item pages', () => {
    const photos = [{ path: 'photos/a.jpg', source: 'coverage', pixel: [10, 20], caption: 'Crack' }, { path: 'photos/b.jpg', source: 'upload' }];
    const features = [mapFeature('p1', '1', 'point', POINT, {
        name: 'Gate', description: 'The **gate** is open', category: 'defect', severity: 'high', status: 'open', assignee: 'J. Doe', dueDate: '2026-11-01', photos
    })];
    const page = () => blocksOf(buildReportModel(inputOf(features)), 'items');

    it('give the reference, the name, the values, the fields, the status, the description and the photos', () => {
        const [, heading, facts, snapshot, description, grid, qr] = page();
        expect(heading).toMatchObject({ level: 2, text: '1 Gate', anchor: 'item-p1', itemId: 'p1', viewerUrl: '/viewer/p1' });
        expect(Object.fromEntries(facts.rows.map(r => [r.label, r.value]))).toMatchObject({
            Reference: '1', Name: 'Gate', Kind: 'Point (2D)', Category: 'Defect', Severity: 'High', Status: 'Open (overdue)', Assignee: 'J. Doe'
        });
        expect(facts.rows.find(r => r.label === 'Coordinates (WGS84)').value).toBe('45.100000, 9.200000');
        expect(facts.rows.find(r => r.label === 'Due date').value).toBe(formatDate(new Date(2026, 10, 1)));
        expect(snapshot).toMatchObject({ kind: 'item', itemId: 'p1' });
        expect(description).toEqual({ type: 'markdown', text: 'The **gate** is open' });
        expect(grid).toEqual({ type: 'photoGrid', itemId: 'p1', photos: [
            { path: 'photos/a.jpg', caption: 'Crack', source: 'coverage', pixel: [10, 20] }, { path: 'photos/b.jpg', caption: '', source: 'upload', pixel: null }
        ] });
        expect(qr).toEqual({ type: 'qr', url: 'https://hub.example/r/acme/north/reports/r_k3x9q2m7#item-p1', label: 'Item 1' });
    });

    it('frame the snapshot of an item on it, 25 % wider and not under 40 m', () => {
        const snapshot = page()[3];
        const [west, south, east, north] = snapshot.frame;
        expect(snapshot.extent).toEqual([9.2, 45.1, 9.2, 45.1]);
        expect(north - south).toBeCloseTo(40 / 111320, 9);
        expect(east - west).toBeGreaterThan(40 / (111320 * Math.cos((45.1 * Math.PI) / 180)) - 1e-9);
    });

    it('show the value of an id the schema does not have as Unknown (<id>)', () => {
        const model = buildReportModel(inputOf([mapFeature('p1', '1', 'point', POINT, { category: 'old', status: 'gone' })]));
        const rows = Object.fromEntries(blocksOf(model, 'items', 'keyValue')[0].rows.map(r => [r.label, r.value]));
        expect(rows).toMatchObject({ Category: 'Unknown (old)', Status: 'Unknown (gone)' });
        expect(blocksOf(model, 'summary', 'summaryStats')[0].groups.find(g => g.key === 'category').counts).toEqual([{ key: 'old', label: 'Unknown (old)', count: 1 }]);
    });

    it('use the anchor and the viewer address the caller makes', () => {
        const links = { anchorUrl: item => `https://x/#${item.id}`, viewerUrl: item => `/v/${item.displayRef}` };
        const model = buildReportModel(inputOf(features, { links }));
        expect(blocksOf(model, 'items', 'qr')[0].url).toBe('https://x/#p1');
        expect(blocksOf(model, 'items', 'heading')[1].viewerUrl).toBe('/v/1');
    });
});

describe('an item of a file that is not numbered yet', () => {
    const features = [
        mapFeature('late', null, 'point', POINT, { name: 'Later', createdAt: '2026-11-03T00:00:00.000Z' }),
        mapFeature('n2', '2', 'point', POINT, { name: 'Second' }),
        mapFeature('early', null, 'point', POINT, { name: 'Earlier', createdAt: '2026-11-02T00:00:00.000Z' }),
        mapFeature('n1', '1', 'point', POINT, { name: 'First' })
    ];
    const model = () => buildReportModel(inputOf(features));

    it('comes after the numbered ones, by creation time, and shows a dash', () => {
        expect(model().items.map(i => [i.id, i.displayRef])).toEqual([['n1', '1'], ['n2', '2'], ['early', '—'], ['late', '—']]);
    });

    it('has no anchor, no viewer action and no QR code, and no link in its table row', () => {
        const m = model();
        const headings = blocksOf(m, 'items', 'heading').filter(h => h.level === 2);
        expect(headings.map(h => [h.itemId, h.anchor, h.viewerUrl])).toEqual([
            ['n1', 'item-n1', '/viewer/n1'], ['n2', 'item-n2', '/viewer/n2'], ['early', null, null], ['late', null, null]
        ]);
        expect(blocksOf(m, 'items', 'qr').map(q => q.label)).toEqual(['Item 1', 'Item 2']);
        expect(tableOf(m, 'points').rows.map(r => r.anchor)).toEqual(['#item-n1', '#item-n2', null, null]);
    });

    it('is shown with the dash and the source label when the report has several sources', () => {
        const input = { ...inputOf([]), definition: definitionOf(['a.geojson', 'b.geojson']), sources: [{ file: 'a.geojson', document: documentOf(features) }, { file: 'b.geojson', document: documentOf([]) }] };
        expect(buildReportModel(input).items.map(i => i.displayRef)).toEqual(['A-1', 'A-2', '—', '—']);
    });
});

describe('the summary', () => {
    const features = [
        mapFeature('a', '1', 'point', POINT, { category: 'defect', severity: 'high', status: 'open', dueDate: '2026-11-14' }),
        mapFeature('b', '2', 'point', POINT, { category: 'defect', status: 'resolved', dueDate: '2026-01-01' }),
        mapFeature('c', '3', 'length', LINE, { status: 'in-progress', dueDate: '2026-11-15' }),
        mapFeature('d', '4', 'length', LINE, { status: 'open', dueDate: '2026-11-16' }),
        mapFeature('e', '5', 'length', LINE)
    ];
    const stats = () => blocksOf(buildReportModel(inputOf(features)), 'summary', 'summaryStats')[0];

    it('counts the items by kind, category, severity and status, "Not set" for those with no value', () => {
        const s = stats();
        const counts = Object.fromEntries(s.groups.map(g => [g.key, g.counts]));
        expect(s.total).toEqual({ count: 5, text: '5 items' });
        expect(counts.kind).toEqual([{ key: 'point', label: 'Points', count: 2 }, { key: 'length', label: 'Lengths', count: 3 }]);
        expect(counts.category).toEqual([{ key: 'defect', label: 'Defect', count: 2 }, { key: '', label: 'Not set', count: 3 }]);
        expect(counts.status).toEqual([{ key: 'open', label: 'Open', count: 2 }, { key: 'in-progress', label: 'In progress', count: 1 }, { key: 'resolved', label: 'Resolved', count: 1 }, { key: '', label: 'Not set', count: 1 }]);
        expect(counts.severity).toEqual([{ key: 'high', label: 'High', count: 1 }, { key: '', label: 'Not set', count: 4 }]);
    });

    it('titles the groups of counts, in their order, and leaves out a group that has none', () => {
        expect(stats().groups.map(g => g.title)).toEqual(['By kind', 'By category', 'By severity', 'By status']);
        const empty = blocksOf(buildReportModel(inputOf([])), 'summary', 'summaryStats')[0];
        expect(empty.groups).toEqual([]);
        expect(empty.headline).toBe('0 items');
    });

    it('counts the overdue items: not closed and a due date before the date of the report', () => {
        const model = buildReportModel(inputOf(features));
        expect(model.items.filter(i => i.overdue).map(i => i.id)).toEqual(['a']);
        expect(stats().overdue).toEqual({ count: 1, text: '1 item' });
        expect(stats().headline).toBe('5 items (1 item overdue)');
    });

    it('counts a past due date as overdue when the schema has no closed status', () => {
        const schema = { ...cloneSettings(DEFAULT_SCHEMA), statuses: [{ id: 'open', name: 'Open', closed: false }, { id: 'resolved', name: 'Resolved', closed: false }] };
        const model = buildReportModel(inputOf(features, { settings: settings({ schema }) }));
        expect(model.items.filter(i => i.overdue).map(i => i.id)).toEqual(['a', 'b']);
    });

    it('lists the punch list: the items that have a status, with the overdue mark', () => {
        const model = buildReportModel(inputOf(features));
        const punch = tableOf(model, 'punchList');
        expect(punch.rows.map(r => [r.cells.ref, r.cells.status])).toEqual([['1', 'Open (overdue)'], ['2', 'Resolved'], ['3', 'In progress'], ['4', 'Open']]);
        expect(punch.rows[0].cells.dueDate).toBe(formatDate(new Date(2026, 10, 14)));
        expect(blocksOf(model, 'tables', 'table').map(t => t.id)).toEqual(['points', 'lengths', 'punchList']);
    });
});

describe('the tables', () => {
    it('come in the order points, lengths, areas, volumes, profiles, 3D measurements, punch list, for the kinds that have items', () => {
        const features = [
            cloudFeature('c', '1', 'circle', { type: 'Point', coordinates: [9.2, 45.1, 0] }, { radius: 2, circumference: 12.57, area: 12.57, unit: 'm' }),
            mapFeature('p', '2', 'profile', LINE, { status: 'open' }),
            mapFeature('v', '3', 'stockpile', square(9.2, 45.1, 20), {}),
            mapFeature('a', '4', 'area', square(9.2, 45.1, 10)),
            mapFeature('l', '5', 'length', LINE),
            mapFeature('x', '6', 'point', POINT)
        ];
        const tables = blocksOf(buildReportModel(inputOf(features)), 'tables', 'table');
        expect(tables.map(t => t.id)).toEqual(['points', 'lengths', 'areas', 'volumes', 'profiles', 'measures3d', 'punchList']);
        expect(tables.map(t => t.title)).toEqual(['Points', 'Lengths', 'Areas', 'Volumes', 'Profiles', '3D measurements', 'Punch list']);
        const circle = tables.find(t => t.id === 'measures3d').rows[0].cells;
        expect(circle).toMatchObject({ measure: 'Circle', value: `Radius ${formatLength(2, 'metric')}` });
    });

    it('map a feature with no type by its geometry, and a 3D point or annotation to a point', () => {
        const features = [
            mapFeature('a', '1', undefined, POINT), mapFeature('b', '2', 'unknown', LINE), mapFeature('c', '3', undefined, square(9.2, 45.1, 5)),
            cloudFeature('d', '4', 'annotation', POINT)
        ];
        const model = buildReportModel(inputOf(features));
        expect(model.items.map(i => i.kind)).toEqual(['point', 'length', 'area', 'point']);
    });

    it('give the points table the coordinates in the CRS of the first layer when it is projected', () => {
        const projection = { name: 'EPSG:32632', project: ([lon, lat]) => [lon * 1000, lat * 1000] };
        const model = buildReportModel(inputOf([mapFeature('a', '1', 'point', POINT)], { projection }));
        const points = tableOf(model, 'points');
        expect(points.columns.map(c => c.label)).toContain('Coordinates (EPSG:32632)');
        expect(points.rows[0].cells.projected).toBe('9200.00, 45100.00');
        expect(blocksOf(model, 'notes', 'keyValue')[0].rows).toContainEqual({ label: 'Coordinate system', value: 'EPSG:32632' });
    });

    it('lists the duplicate references of a file', () => {
        const model = buildReportModel(inputOf([mapFeature('a', '3', 'point', POINT), mapFeature('b', '3', 'point', POINT)]));
        expect(blocksOf(model, 'summary', 'note')[0].text).toBe('Source A uses the reference 3 more than once');
        expect(model.notices).toEqual([{ code: 'duplicateRef', text: 'Source A uses the reference 3 more than once' }]);
        expect(model.items).toHaveLength(2);
    });
});

describe('the notes section', () => {
    it('has the notes, the units, the layers with their build dates, the source rasters, the disclaimer and the sign-off', () => {
        const definition = definitionOf(['a.geojson'], { notes: 'Weather was *clear*', preparedBy: 'J. Doe' });
        const pile = mapFeature('s', '1', 'stockpile', square(9.2, 45.1, 20), { sourceRaster: 'dsm.tif' });
        const built = new Date(2026, 9, 1);
        const model = buildReportModel(inputOf([pile], {
            definition, units: 'imperial', settings: settings({ templates: [template({ disclaimer: 'Not for **legal** use' })] }),
            layerInfo: { 'ortho.tif': { name: 'Orthophoto', builtAt: built } }
        }));
        const blocks = blocksOf(model, 'notes');
        expect(blocks.map(b => b.type)).toEqual(['heading', 'markdown', 'keyValue', 'table', 'table', 'markdown', 'signOff']);
        expect(blocks[1].text).toBe('Weather was *clear*');
        expect(blocks[2].rows).toEqual([{ label: 'Units', value: 'Imperial' }, { label: 'Coordinate system', value: 'WGS84' }]);
        expect(blocks[3]).toMatchObject({ id: 'layers', rows: [{ cells: { name: 'Orthophoto', path: 'ortho.tif', built: formatDate(built) } }] });
        expect(blocks[4]).toMatchObject({ id: 'sourceRasters', rows: [{ cells: { name: 'dsm.tif', path: 'dsm.tif', built: EMPTY_CELL } }] });
        expect(blocks[5].text).toBe('Not for **legal** use');
        expect(blocks[6]).toEqual({ type: 'signOff', byline: 'Prepared by J. Doe', lines: [{ label: 'Name' }, { label: 'Signature' }, { label: 'Date' }] });
    });
});
