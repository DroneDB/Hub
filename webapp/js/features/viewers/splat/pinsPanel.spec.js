import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import AnnotationManager from './AnnotationManager.vue';
import PinCard from './PinCard.vue';
import SplatCameraRail from './SplatCameraRail.vue';

const pins = [
    { id: 1, title: 'Gate', text: 'The **north** gate', link: 'https://example.com/gate', image: 'photos/gate.jpg', position: [0, 0, 0], view: null },
    { id: 2, title: 'Door', text: '', link: '', image: '', position: [1, 0, 0], view: null }
];
const stubs = { Window: { template: '<div><slot /></div>' }, Button: { props: ['label'], template: '<button class="stub-button">{{ label }}</button>' } };
const manager = props => mount(AnnotationManager, { props: { pins, canWrite: true, dirty: false, activeIndex: 0, ...props }, global: { stubs } });

describe('the panel of pins', () => {
    it('lets a writer name, move, view-save and remove pins, and add one', () => {
        const wrapper = manager();
        expect(wrapper.findAll('.saved-row')).toHaveLength(2);
        expect(wrapper.find('input.name').element.value).toBe('Gate');
        expect(wrapper.findAll('.stub-button').map(b => b.text())).toEqual(['Add a pin', 'Save', 'Close']);
        for (const label of ['Show this pin', 'Save the current view with this pin', 'Move up', 'Move down', 'Remove this pin']) {
            expect(wrapper.find(`[aria-label="${label}"]`).exists(), label).toBe(true);
        }
        expect(wrapper.find('.pin-editor').exists()).toBe(true);
    });

    it('asks its owner to do what the user asked, with the pin\'s place in the list', async () => {
        const wrapper = manager();
        await wrapper.findAll('[aria-label="Show this pin"]')[1].trigger('click');
        await wrapper.findAll('[aria-label="Remove this pin"]')[1].trigger('click');
        await wrapper.findAll('[aria-label="Move down"]')[0].trigger('click');
        const names = wrapper.findAll('input.name');
        names[1].element.value = '  Back door ';
        await names[1].trigger('change');
        expect(wrapper.emitted('goto')[0]).toEqual([1]);
        expect(wrapper.emitted('delete')[0]).toEqual([1]);
        expect(wrapper.emitted('move')[0]).toEqual([{ index: 0, dir: 1 }]);
        expect(wrapper.emitted('rename')[0]).toEqual([{ index: 1, name: 'Back door' }]);
    });

    it('shows a reader the pins and nothing to change them with', () => {
        const wrapper = manager({ canWrite: false });
        expect(wrapper.findAll('.saved-row')).toHaveLength(2);
        expect(wrapper.find('[aria-label="Show this pin"]').exists()).toBe(true);
        for (const label of ['Save the current view with this pin', 'Move up', 'Move down', 'Remove this pin']) {
            expect(wrapper.find(`[aria-label="${label}"]`).exists(), label).toBe(false);
        }
        expect(wrapper.find('.pin-editor').exists()).toBe(false);
        expect(wrapper.find('input.name').attributes('readonly')).toBeDefined();
        expect(wrapper.findAll('.stub-button').map(b => b.text())).toEqual(['Close']);
        expect(wrapper.find('.readonly-note').text()).toContain('Read-only access');
    });

    it('applies a text, a good link and a good image, and refuses a link that is not a web address and an image outside the dataset', async () => {
        const wrapper = manager();
        const [text, link, image] = ['textarea', 'input[type="url"]', 'input[placeholder="photos/gate.jpg"]'].map(s => wrapper.find(s));

        text.element.value = 'New **text**';
        await text.trigger('change');
        link.element.value = 'javascript:alert(1)';
        await link.trigger('change');
        image.element.value = '../secrets.jpg';
        await image.trigger('change');
        expect(wrapper.emitted('edit')).toEqual([[{ index: 0, changes: { text: 'New **text**' } }]]);
        expect(wrapper.text()).toContain('A link must be a web address');
        expect(wrapper.text()).toContain('The image must be a path inside this dataset');
        // The field goes back to what the pin has
        expect(link.element.value).toBe('https://example.com/gate');

        link.element.value = ' https://example.org ';
        await link.trigger('change');
        image.element.value = '';
        await image.trigger('change');
        expect(wrapper.emitted('edit').slice(1)).toEqual([
            [{ index: 0, changes: { link: 'https://example.org' } }],
            [{ index: 0, changes: { image: '' } }]
        ]);
        expect(wrapper.text()).not.toContain('A link must be a web address');
    });
});

describe('the card of a pin', () => {
    it('shows the title, the Markdown text, the link in another tab and the image', () => {
        const card = mount(PinCard, { props: { pin: pins[0], imageUrl: '/orgs/o/ds/d/thumb?path=photos%2Fgate.jpg&size=800' } });
        expect(card.find('h3').text()).toBe('Gate');
        expect(card.find('.pin-text strong').text()).toBe('north');
        const link = card.find('a.pin-link');
        expect(link.attributes()).toMatchObject({ href: 'https://example.com/gate', target: '_blank', rel: 'noopener noreferrer' });
        expect(card.find('img.pin-image').attributes('src')).toContain('thumb?path=photos');
    });

    it('does not run a script in the text, and does not load an image from the text', () => {
        const card = mount(PinCard, {
            props: { pin: { ...pins[1], text: '<script>alert(1)</script><img src=x onerror=alert(1)>\n\n![tracker](https://evil.example/t.png) [bad](javascript:alert(1))' } }
        });
        // The markup is shown as text; no element of it exists, and no link goes to javascript:
        const text = card.find('.pin-text');
        expect(text.find('script, img, [onerror]').exists()).toBe(false);
        expect(text.findAll('a')).toHaveLength(0);
        expect(card.find('img').exists()).toBe(false);
        expect(text.html()).not.toContain('<script');
        expect(text.text()).toContain('tracker');
    });

    it('offers editing to a writer only', async () => {
        const writer = mount(PinCard, { props: { pin: pins[0], canWrite: true } });
        await writer.find('[aria-label="Edit this pin"]').trigger('click');
        expect(writer.emitted('edit')).toHaveLength(1);
        expect(mount(PinCard, { props: { pin: pins[0], canWrite: false } }).find('[aria-label="Edit this pin"]').exists()).toBe(false);
    });
});

describe('the rail', () => {
    it('offers the tour when there is a stop, cameras or pins with a view', () => {
        const tourButton = props => mount(SplatCameraRail, { props: { cameras: [], activeIndex: null, ...props } }).find('[aria-label="Start cycling"]');
        expect(tourButton({ hasTour: true }).exists()).toBe(true);
        expect(tourButton({ hasTour: false }).exists()).toBe(false);
    });
});
