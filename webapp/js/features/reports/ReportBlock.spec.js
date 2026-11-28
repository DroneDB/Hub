/**
 * One component per type of block of the report model: every type the model makes has one, an unknown type is left out
 * (a model of a later version), and each takes only the block as its data, so that a renderer that comes later (the
 * snapshots, the charts, the 3D captures) replaces the component of its type without touching the page.
 */
import { describe, it, expect } from 'vitest';
import { h } from 'vue';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import { buildReportModel } from '@/libs/reports/reportModel';
import { cloudFeature, inputOf, mapFeature, settings, template } from '@/libs/reports/reportModel.fixtures';
import { donutGeometry } from '@/libs/reports/donutChart';
import ReportBlock from './ReportBlock.vue';
import ReportSection from './ReportSection.vue';
import { BLOCK_COMPONENTS } from './blocks/blockComponents';
import SummaryStatsBlock from './blocks/SummaryStatsBlock.vue';
import SignOffBlock from './blocks/SignOffBlock.vue';
import { provideReportContext } from './reportContext';

const withContext = component => ({
    setup(props) {
        provideReportContext({ dataset: { thumbUrl: () => '/thumb' }, photoEntries: { value: null } });
        return () => component(props);
    }
});

describe('the block components', () => {
    it('have one for every type of block the model makes', () => {
        const features = [
            mapFeature('p1', '1', 'point', { type: 'Point', coordinates: [11, 45] }, { photos: [{ path: 'a.jpg' }], description: 'text' }),
            mapFeature('l1', '2', 'profile', { type: 'LineString', coordinates: [[11, 45], [11.001, 45]] }),
            cloudFeature('c1', '3', 'distance', { type: 'LineString', coordinates: [[11, 45], [11.001, 45]] }, { distance: 12 })
        ];
        const model = buildReportModel(inputOf(features));
        const types = new Set(model.sections.flatMap(s => s.blocks).map(b => b.type));
        expect([...types].filter(type => !(type in BLOCK_COMPONENTS))).toEqual([]);
        // The ones a renderer will take over
        for (const type of ['mapSnapshot', 'chart', 'capture3d', 'qr']) expect(types.has(type)).toBe(true);
    });

    it('draws nothing for a type this page does not know', () => {
        const wrapper = mount(ReportBlock, { props: { block: { type: 'hologram' } } });
        expect(wrapper.html()).toBe('<!--v-if-->');
    });

    it('give the name of the item to the photo grid, from the heading before it on the page', () => {
        const section = {
            kind: 'items', title: 'Items',
            blocks: [
                { type: 'heading', level: 2, text: '1 Crack', anchor: 'item-p1', itemId: 'p1', viewerUrl: null },
                { type: 'photoGrid', itemId: 'p1', photos: [{ path: 'photos/a.jpg', caption: '', source: 'dataset', pixel: null }] }
            ]
        };
        const wrapper = mount(withContext(props => h(ReportSection, props)), { props: { section }, global: { plugins: [PrimeVue] } });
        expect(wrapper.find('img').attributes('alt')).toBe('1 Crack - a.jpg');
    });
});

describe('the texts of the summary and the sign-off', () => {
    const counts = [{ key: 'point', label: 'Points', count: 2 }];
    const summary = {
        type: 'summaryStats', total: { count: 2, text: '2 items' }, overdue: { count: 1, text: '1 item' }, headline: 'Two items, one late',
        totals: [{ key: 'area', label: 'Area', text: '150 m²', partsText: '100 m² 2D, 50 m² 3D', parts: [{}, {}] }],
        groups: [{ key: 'kind', title: 'Per kind', counts }]
    };

    it('are the model\'s: the headline, the parts of a total and the titles of the groups of counts', () => {
        const text = mount(SummaryStatsBlock, { props: { block: summary } }).text();
        expect(text).toContain('Two items, one late');
        expect(text).toContain('100 m² 2D, 50 m² 3D');
        expect(text).toContain('Per kind');
        // A count is its name, its bar and its number
        const bar = mount(SummaryStatsBlock, { props: { block: summary } }).find('.report-summary-bar');
        expect(bar.find('.report-summary-bar-label').text()).toBe('Points');
        expect(bar.find('.report-summary-bar-count').text()).toBe('2');
        expect(text).not.toContain('By kind');
    });

    it('are the page\'s and the PDF\'s alike for a model that has them', () => {
        const model = buildReportModel(inputOf([mapFeature('p1', '1', 'point', { type: 'Point', coordinates: [11, 45] }, { status: 'open' })], {
            definition: { ...inputOf([]).definition, preparedBy: 'J. Doe' }
        }));
        const blocks = model.sections.flatMap(s => s.blocks);
        const stats = blocks.find(b => b.type === 'summaryStats');
        const text = mount(SummaryStatsBlock, { props: { block: stats } }).text();
        for (const group of stats.groups) expect(text).toContain(group.title);
        expect(mount(SignOffBlock, { props: { block: blocks.find(b => b.type === 'signOff') } }).text()).toContain('Prepared by J. Doe');
    });
});

describe('the counts of the summary as donuts', () => {
    const features = [
        mapFeature('a', '1', 'point', { type: 'Point', coordinates: [11, 45] }, { severity: 'high', status: 'open' }),
        mapFeature('b', '2', 'point', { type: 'Point', coordinates: [11, 45] }, { severity: 'high' }),
        mapFeature('c', '3', 'point', { type: 'Point', coordinates: [11, 45] }, { severity: 'low' })
    ];
    const statsWith = breakdownChart => buildReportModel(inputOf(features, { settings: settings({ templates: [template({ breakdownChart })] }) }))
        .sections.flatMap(s => s.blocks).find(b => b.type === 'summaryStats');

    it('draw a ring per group with a slice per count, the items in the hole, and a legend of names, counts and shares', () => {
        const stats = statsWith('donuts');
        const wrapper = mount(SummaryStatsBlock, { props: { block: stats } });
        const donuts = wrapper.findAll('.report-donut');
        expect(donuts).toHaveLength(stats.groups.length);
        expect(wrapper.find('.report-summary-bar').exists()).toBe(false);
        stats.groups.forEach((group, index) => {
            const donut = donuts[index];
            expect(donut.find('.report-donut-title').text()).toBe(group.title);
            const paths = donut.findAll('path');
            expect(paths.map(p => p.attributes('fill'))).toEqual(group.counts.map(c => c.colour));
            expect(paths.map(p => p.attributes('d'))).toEqual(donutGeometry(group.counts).slices.map(s => s.d));
            expect(paths.map(p => p.find('title').text())).toEqual(group.counts.map(c => `${c.label}: ${c.count}`));
            expect(donut.findAll('text').map(t => t.text())).toEqual(['3', 'items']);
            expect(donut.findAll('.report-donut-legend li').map(li => [li.find('.report-donut-label').text(), li.find('.report-donut-count').text(), li.find('.report-donut-share').text()]))
                .toEqual(group.counts.map(c => [c.label, String(c.count), c.share]));
        });
        const severity = stats.groups.find(g => g.key === 'severity');
        expect(severity.counts.map(c => [c.label, c.share])).toEqual([['Low', '33%'], ['High', '67%']]);
    });

    it('are not drawn for a template that keeps bars', () => {
        const wrapper = mount(SummaryStatsBlock, { props: { block: statsWith('bars') } });
        expect(wrapper.find('.report-donut').exists()).toBe(false);
        expect(wrapper.find('.report-summary-bar').exists()).toBe(true);
    });
});

describe('the logo of the cover', () => {
    it('is drawn on the page from the block of the model, with its alternative text', () => {
        const model = buildReportModel(inputOf([], { brandingLogoUrl: '/images/acme.svg' }));
        const block = model.sections.find(s => s.kind === 'cover').blocks[0];
        const wrapper = mount(ReportBlock, { props: { block } });
        const img = wrapper.find('img');
        expect(img.attributes('src')).toBe('/images/acme.svg');
        expect(img.attributes('alt')).toBe('Logo');
    });

    it('keeps its place and drops the image when the logo cannot be read', async () => {
        const wrapper = mount(ReportBlock, { props: { block: { type: 'logo', source: 'template', url: '/logo/x', alt: 'ACME logo' } } });
        await wrapper.find('img').trigger('error');
        expect(wrapper.find('img').exists()).toBe(false);
        expect(wrapper.find('[data-block="logo"]').exists()).toBe(true);
    });
});
