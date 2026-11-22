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
import { cloudFeature, inputOf, mapFeature } from '@/libs/reports/reportModel.fixtures';
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
        expect(text).toContain('(100 m² 2D, 50 m² 3D)');
        expect(text).toContain('Per kind');
        expect(text).toContain('Points: 2');
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
