/**
 * The live page of a report: the sections of the model drawn with headings in order, tables with headers, notes through
 * the one markdown path, the notices, the item the address names (and the notice when the report has none like it), and
 * Edit and Delete for writers only.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { computed, defineComponent, h, reactive, ref, shallowRef } from 'vue';
import PrimeVue from 'primevue/config';
import { buildReportModel } from '@/libs/reports/reportModel';
import { cloudFeature, definitionOf, documentOf, inputOf, mapFeature, settings, template } from '@/libs/reports/reportModel.fixtures';

const m = vi.hoisted(() => ({ report: null, route: null, push: vi.fn(), actions: null, photoEntries: vi.fn() }));
vi.mock('vue-router', () => ({ useRoute: () => m.route, useRouter: () => ({ push: m.push }) }));
vi.mock('./useReport', () => ({ useReport: () => m.report }));
vi.mock('./useReportActions', () => ({ useReportActions: () => m.actions }));
vi.mock('@/libs/reports/photoFiles', () => ({ photoEntries: (...a) => m.photoEntries(...a) }));

const { default: ReportPage } = await import('./ReportPage.vue');

const point = (id, ref, props = {}) => mapFeature(id, ref, 'point', { type: 'Point', coordinates: [11, 45] }, { name: `Point ${ref}`, ...props });
const longText = '<img src=x onerror="alert(1)"> **bold** [click](javascript:alert(1)) <script>alert(2)</script>';

const ViewerShellStub = defineComponent({
    props: { loadError: { type: null, default: null }, loading: Boolean, name: { type: String, default: null } },
    setup(props, { slots }) {
        return () => h('div', { class: 'shell', 'data-load-error': props.loadError ? 'yes' : '' }, [h('div', { class: 'bar' }, slots.bar?.()), h('div', { class: 'body' }, slots.default?.())]);
    }
});
const ResourceStateStub = defineComponent({
    props: { kind: { type: String, default: '' }, resource: { type: String, default: '' }, message: { type: String, default: '' } },
    render() { return h('div', { class: 'state', 'data-kind': this.kind, 'data-resource': this.resource }, this.message); }
});

const modelOf = (features, extra = {}, overrides = {}) => buildReportModel(inputOf(features, {
    links: {
        reportUrl: 'https://hub.example/r/acme/site/reports/r_k3x9q2m7',
        viewerUrl: item => `/r/acme/site/views/v_cover?item=${item.id}`
    },
    ...extra
}, overrides));

let wrapper;
async function render(model, { canWrite = true, ...state } = {}) {
    m.report = {
        dataset: { thumbUrl: () => '/thumb' },
        loading: ref(false), loadError: shallowRef(null), missing: ref(false), unreadable: ref(''), canWrite: ref(canWrite),
        model: shallowRef(model), entry: shallowRef({ uid: 'r_k3x9q2m7', name: 'North pit', data: {} }), reload: vi.fn(),
        errorMessage: computed(() => ''), ...state
    };
    wrapper = mount(ReportPage, {
        attachTo: document.body,
        global: { plugins: [PrimeVue], stubs: { ViewerShell: ViewerShellStub, ResourceState: ResourceStateStub, DialogHost: true } }
    });
    await flushPromises();
    return wrapper;
}

beforeEach(() => {
    window.HubOptions = { appName: 'DroneDB' };
    m.route = reactive({ params: { org: 'acme', ds: 'site', uid: 'r_k3x9q2m7' }, hash: '' });
    m.actions = { edit: vi.fn(), remove: vi.fn(async () => true) };
    m.photoEntries.mockReset();
    m.push.mockReset();
    Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
    wrapper?.unmount();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('the sections', () => {
    it('are drawn in the order of the model, the report name the only h1, a section its h2 and an item its h3', async () => {
        await render(modelOf([point('p1', '1'), point('p2', '2')]));
        expect(wrapper.findAll('h1').map(x => x.text())).toEqual(['North pit']);
        expect(wrapper.findAll('[data-section]').map(s => s.attributes('data-section'))).toEqual(['cover', 'summary', 'overview', 'tables', 'items', 'notes']);
        const items = wrapper.find('[data-section="items"]');
        expect(items.find('h2').text()).toBe('Items');
        expect(items.findAll('h3').map(x => x.text())).toEqual(expect.arrayContaining([expect.stringContaining('1 Point 1'), expect.stringContaining('2 Point 2')]));
        expect(wrapper.find('[data-section="cover"] h2').text()).toBe('Inspection');
    });

    it('leaves out a section the definition switches off', async () => {
        const model = buildReportModel(inputOf([point('p1', '1')], { definition: definitionOf(['a.geojson'], { sections: [{ kind: 'cover', enabled: true }, { kind: 'items', enabled: false }] }) }));
        await render(model);
        expect(wrapper.findAll('[data-section]').map(s => s.attributes('data-section'))).toEqual(['cover']);
    });

    it('says so when every section is off', async () => {
        const model = buildReportModel(inputOf([point('p1', '1')], { definition: definitionOf(['a.geojson'], { sections: [{ kind: 'cover', enabled: false }] }) }));
        await render(model);
        expect(wrapper.text()).toContain('Every section of this report is switched off.');
    });

    it('show an empty state in place of the tables and the item pages when no item passes the filter', async () => {
        await render(modelOf([]));
        expect(wrapper.find('[data-section="tables"]').text()).toContain('No items match the filter of this report');
        expect(wrapper.find('[data-section="items"]').text()).toContain('No items match the filter of this report');
    });
});

describe('the tables', () => {
    it('have a caption, column headers with scope, and a row header that links to the item page', async () => {
        await render(modelOf([point('p1', '1'), point('p2', '2')]));
        const table = wrapper.find('[data-section="tables"] table');
        expect(table.find('caption').text()).toBe('Points');
        expect(table.findAll('thead th').every(th => th.attributes('scope') === 'col')).toBe(true);
        const rowHeader = table.find('tbody tr th');
        expect(rowHeader.attributes('scope')).toBe('row');
        expect(rowHeader.find('a').attributes('href')).toBe('#item-p1');
    });

    it('scroll inside their own region, which can be reached with the keyboard and is named', async () => {
        await render(modelOf([point('p1', '1')]));
        const region = wrapper.find('.report-table-scroll');
        expect(region.attributes('role')).toBe('region');
        expect(region.attributes('aria-label')).toBe('Points');
        expect(region.attributes('tabindex')).toBe('0');
    });
});

describe('the items', () => {
    it('have the anchor of the item and "Open in viewer" on a new tab', async () => {
        await render(modelOf([point('p1', '1')]));
        const heading = wrapper.find('#item-p1');
        expect(heading.exists()).toBe(true);
        expect(heading.attributes('tabindex')).toBe('-1');
        // The viewer link is in the header of the item's card, beside its heading
        const viewer = wrapper.find('[data-section-part="item"] .report-item-viewer');
        expect(viewer.attributes('href')).toBe('/r/acme/site/views/v_cover?item=p1');
        expect(viewer.attributes('target')).toBe('_blank');
        expect(viewer.attributes('rel')).toBe('noopener');
    });

    it('show an item of a file that is not numbered with a dash and no anchor, viewer action or link in the table', async () => {
        await render(modelOf([point('u1', null)]));
        expect(wrapper.find('#item-u1').exists()).toBe(false);
        expect(wrapper.find('.report-item-viewer').exists()).toBe(false);
        const heading = wrapper.find('[data-section="items"] h3');
        expect(heading.text()).toContain('—');
        expect(wrapper.find('[data-section="tables"] tbody th a').exists()).toBe(false);
    });

    it('show their text through the markdown path: formatted, with no script, no image and no script link', async () => {
        await render(modelOf([point('p1', '1', { description: longText })]));
        const text = wrapper.find('[data-section="items"] .report-markdown');
        expect(text.find('strong').text()).toBe('bold');
        // The raw HTML of the text is shown as text, never as elements, and the script link has no address
        for (const tag of ['script', 'img', 'a']) expect(text.find(tag).exists()).toBe(false);
        expect(text.element.querySelectorAll('[onerror], [href]')).toHaveLength(0);
    });

    it('show the notes and the disclaimer through the same path', async () => {
        const model = buildReportModel(inputOf([point('p1', '1')], {
            definition: definitionOf(['a.geojson'], { notes: longText }),
            settings: settings({ templates: [template({ disclaimer: '<b onclick="alert(3)">careful</b> [web](https://example.com)' })] })
        }));
        await render(model);
        const notes = wrapper.findAll('[data-section="notes"] .report-markdown');
        expect(notes).toHaveLength(2);
        expect(notes[0].find('strong').text()).toBe('bold');
        for (const note of notes) {
            expect(note.find('script').exists()).toBe(false);
            expect(note.element.querySelectorAll('[onclick], [onerror]')).toHaveLength(0);
        }
        expect(notes[1].find('a').attributes('rel')).toBe('noopener noreferrer');
        expect(notes[1].find('a').attributes('target')).toBe('_blank');
    });

    it('draw a snapshot, a chart and a 3D capture as figures with their alternative text', async () => {
        const features = [
            point('p1', '1'),
            mapFeature('l1', '2', 'profile', { type: 'LineString', coordinates: [[11, 45], [11.001, 45]] }, { name: 'Cut' }),
            cloudFeature('c1', '3', 'distance', { type: 'LineString', coordinates: [[11, 45], [11.001, 45]] }, { name: 'Span', distance: 12 })
        ];
        await render(modelOf(features));
        const labels = wrapper.findAll('figure [role="img"]').map(f => f.attributes('aria-label'));
        expect(labels).toEqual(expect.arrayContaining(['Map of item 1', 'Elevation profile of item 2', 'No 3D snapshot']));
        expect(wrapper.findAll('figure').every(f => f.find('figcaption').exists())).toBe(true);
    });

    it('show a photo that was deleted from the dataset as a "Missing photo" tile with its path', async () => {
        m.photoEntries.mockResolvedValue(new Map([['photos/kept.jpg', { hash: 'h', properties: { width: 400, height: 300 } }]]));
        await render(modelOf([point('p1', '1', { photos: [{ path: 'photos/gone.jpg', source: 'dataset' }, { path: 'photos/kept.jpg', source: 'dataset', caption: 'Crack' }] })]));
        expect(m.photoEntries.mock.calls[0][1]).toEqual(new Set(['photos/gone.jpg', 'photos/kept.jpg']));
        const tiles = wrapper.findAll('.report-photo');
        expect(tiles[0].text()).toContain('Missing photo');
        expect(tiles[0].text()).toContain('photos/gone.jpg');
        expect(tiles[1].find('img').attributes('alt')).toContain('Crack');
    });
});

describe('the notices', () => {
    it('say that the template was deleted and which one the report uses', async () => {
        const model = buildReportModel(inputOf([point('p1', '1')], { definition: definitionOf(['a.geojson'], { templateId: 'gone' }) }));
        await render(model);
        expect(wrapper.find('[data-notice="templateMissing"]').text()).toContain('Template gone no longer exists; this report uses');
    });

    it('say that the cover view was deleted', async () => {
        await render(modelOf([point('p1', '1')], { coverView: { deleted: true } }));
        expect(wrapper.find('[data-notice="coverDeleted"]').text()).toBe('The cover view was deleted');
    });

    it('name a source that could not be read, and the items of the others stay', async () => {
        const model = buildReportModel(inputOf([point('p1', '1')], {
            definition: definitionOf(['a.geojson', 'gone.geojson']),
            sources: [{ label: 'A', file: 'a.geojson', document: documentOf([point('p1', '1')]) }, { label: 'B', file: 'gone.geojson', error: 'The file does not exist' }]
        }));
        await render(model);
        expect(wrapper.find('[data-notice="sourceFailed"]').text()).toContain('gone.geojson');
        expect(wrapper.find('#item-p1').exists()).toBe(true);
    });
});

describe('the item the address names', () => {
    it('is brought into view and focused when the report has it', async () => {
        m.route.hash = '#item-p2';
        await render(modelOf([point('p1', '1'), point('p2', '2')]));
        const heading = document.getElementById('item-p2');
        expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
        expect(document.activeElement).toBe(heading);
        expect(wrapper.find('[data-testid="item-missing"]').exists()).toBe(false);
    });

    it('says "This item is no longer in this report" at the top when no item has the id', async () => {
        m.route.hash = '#item-deleted-one';
        await render(modelOf([point('p1', '1')]));
        const notice = wrapper.find('[data-testid="item-missing"]');
        expect(notice.text()).toBe('This item is no longer in this report');
        expect(notice.attributes('role')).toBe('alert');
        expect(wrapper.find('.report-document').element.firstElementChild).toBe(notice.element);
        expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    });

    it('says it when the item is filtered out, and when the sections leave the item pages out', async () => {
        m.route.hash = '#item-p1';
        const filtered = buildReportModel(inputOf([point('p1', '1')], { definition: definitionOf(['a.geojson'], { filter: { groups: [], categories: [], severities: [], statuses: ['closed'], kinds: [], owners: [] } }) }));
        await render(filtered);
        expect(wrapper.find('[data-testid="item-missing"]').exists()).toBe(true);
        wrapper.unmount();
        const excluded = buildReportModel(inputOf([point('p1', '1', { report: false })]));
        await render(excluded);
        expect(wrapper.find('[data-testid="item-missing"]').exists()).toBe(true);
        wrapper.unmount();
        const noPages = buildReportModel(inputOf([point('p1', '1')], { definition: definitionOf(['a.geojson'], { sections: [{ kind: 'cover', enabled: true }, { kind: 'items', enabled: false }] }) }));
        await render(noPages);
        expect(wrapper.find('[data-testid="item-missing"]').exists()).toBe(true);
    });

    it('does not say it for another hash, or for none', async () => {
        m.route.hash = '#summary';
        await render(modelOf([point('p1', '1')]));
        expect(wrapper.find('[data-testid="item-missing"]').exists()).toBe(false);
    });

    it('follows a change of the hash while the page is open', async () => {
        await render(modelOf([point('p1', '1')]));
        m.route.hash = '#item-nope';
        await flushPromises();
        expect(wrapper.find('[data-testid="item-missing"]').exists()).toBe(true);
    });
});

describe('Edit and Delete', () => {
    it('show to a user who can write, and open the editor on the stored report', async () => {
        await render(modelOf([point('p1', '1')]));
        await wrapper.find('[data-testid="report-edit"]').trigger('click');
        expect(m.actions.edit).toHaveBeenCalledWith(m.report.entry.value);
        expect(wrapper.find('[data-testid="report-delete"]').exists()).toBe(true);
    });

    it('do not show to a reader', async () => {
        await render(modelOf([point('p1', '1')]), { canWrite: false });
        expect(wrapper.find('[data-testid="report-edit"]').exists()).toBe(false);
        expect(wrapper.find('[data-testid="report-delete"]').exists()).toBe(false);
        expect(wrapper.find('.report-bar-actions').exists()).toBe(true);
    });

    it('take the user back to the dataset once the report was deleted, and stay when it was not', async () => {
        await render(modelOf([point('p1', '1')]));
        await wrapper.find('[data-testid="report-delete"]').trigger('click');
        await flushPromises();
        expect(m.actions.remove).toHaveBeenCalledWith(m.report.entry.value);
        expect(m.push).toHaveBeenCalledWith({ name: 'ViewDataset', params: { org: 'acme', ds: 'site' } });
        m.push.mockClear();
        m.actions.remove.mockResolvedValue(false);
        await wrapper.find('[data-testid="report-delete"]').trigger('click');
        await flushPromises();
        expect(m.push).not.toHaveBeenCalled();
    });
});

describe('the states', () => {
    it('is "This report was deleted or the link is wrong" when the report is not there', async () => {
        await render(null, { missing: ref(true) });
        const state = wrapper.find('.state');
        expect(state.attributes('data-kind')).toBe('not-found');
        expect(state.attributes('data-resource')).toBe('report');
        expect(state.text()).toBe('This report was deleted or the link is wrong.');
        expect(wrapper.find('.report-document').exists()).toBe(false);
    });

    it('says why a report cannot be read', async () => {
        await render(null, { unreadable: ref('This report cannot be read: bad.') });
        expect(wrapper.find('.state').text()).toBe('This report cannot be read: bad.');
    });

    it('gives the error of the dataset to the shell, which shows no access, sign in and not found', async () => {
        await render(null, { loadError: shallowRef(new Error('denied')) });
        expect(wrapper.find('.shell').attributes('data-load-error')).toBe('yes');
        expect(wrapper.find('.report-document').exists()).toBe(false);
    });

    it('draws nothing while it loads', async () => {
        await render(null, { loading: ref(true) });
        expect(wrapper.find('.report-document').exists()).toBe(false);
        expect(wrapper.find('.state').exists()).toBe(false);
    });
});
