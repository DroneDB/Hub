/**
 * The title and the description of an annotation are HTML inside Potree and plain text everywhere else: the properties
 * dialog shows the text of a loaded annotation, what it saves is escaped on its way into Potree and comes back to the
 * file as it was typed, and the tooltip of the description shows the text once. The real Potree, the real converter and
 * the real storage run; the viewer around them is a stand-in.
 */
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { ref } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import { loadPotree } from '@/libs/potree/potreeLibs.fixtures';
import AnnotationPropertiesDialog from '@/features/viewers/pointcloud/AnnotationPropertiesDialog.vue';

vi.mock('@/composables/useMapAlerts', () => ({ flash: vi.fn() }));

const { usePotreeMeasurements } = await import('./usePotreeMeasurements');

const PATH = 'a/cloud_measurements.geojson';
const FILE = {
    type: 'FeatureCollection',
    features: [{
        type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] },
        properties: { measurementType: 'annotation', name: "Gate A & B's", description: 'first\nsecond', localCoordinates: [1, 2, 3] }
    }]
};

let stored;
let wrapper;
const listeners = new Map();
const session = {
    track: (target, type, fn) => {
        if (typeof target.addEventListener === 'function') target.addEventListener(type, fn);
        else listeners.set(`${target.id}:${type}`, fn);
    },
    untrack: () => {},
    adopt: el => el
};

beforeAll(() => {
    const Potree = loadPotree();
    globalThis.Potree = Potree;
});
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
});

async function start() {
    stored = { [PATH]: JSON.stringify(FILE) };
    const dataset = {
        getFileContents: vi.fn(async path => stored[path]),
        writeObj: vi.fn(async (path, blob) => { stored[path] = await blob.text(); }),
        deleteObj: vi.fn()
    };
    const dialogs = { open: vi.fn(() => ({ close: vi.fn() })) };
    const m = usePotreeMeasurements({ entry: ref({ path: 'a/cloud.laz' }), dataset: ref(dataset), canWrite: ref(true), error: ref(''), dialogs });
    const annotations = {
        id: 'annotations', children: [],
        add(a) { this.children.push(a); listeners.get('annotations:annotation_added')?.({ annotation: a }); },
        traverse(fn) { this.children.forEach(fn); },
        removeAllChildren() { this.children = []; },
        remove(a) { this.children = this.children.filter(x => x !== a); }
    };
    const viewer = {
        scene: { id: 'scene', measurements: [], annotations, addMeasurement() {}, removeMeasurement() {} },
        renderer: { domElement: Object.assign(document.createElement('canvas'), { id: 'canvas' }) }
    };
    m.attach(viewer, session, { srs: null });
    await m.load();
    return { m, dialogs, annotation: annotations.children[0] };
}

/** The dialog the double click on the annotation opens, as the viewer's dialog host would mount it */
function openedDialog(dialogs, annotation) {
    annotation.domElement.find('.annotation-titlebar')[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    const [component, props] = dialogs.open.mock.calls.at(-1);
    expect(component).toBe(AnnotationPropertiesDialog);
    return props;
}

describe('the annotation dialog', () => {
    it('shows the name and the description of a loaded annotation as text, with its two lines', async () => {
        const { dialogs, annotation } = await start();
        const props = openedDialog(dialogs, annotation);

        wrapper = mount(AnnotationPropertiesDialog, { props: { annotation, showDelete: true }, attachTo: document.body, global: { plugins: [PrimeVue] } });
        await flushPromises();

        expect(document.getElementById('ap-name').value).toBe("Gate A & B's");
        expect(document.getElementById('ap-description').value).toBe('first\nsecond');
        expect(document.querySelector('#annotation-properties').textContent).toContain("Edit: Gate A & B's");
        expect(props.annotation).toBe(annotation);
    });

    it('saves what is typed without making an element of it, and the file has it as typed', async () => {
        const { m, dialogs, annotation } = await start();
        const props = openedDialog(dialogs, annotation);

        props.onSave({ name: "Bob's <b>pile</b> & co", description: 'a <b>x</b>\n<img src=x onerror=alert(1)>' });

        const label = annotation.domElement.find('.annotation-label');
        const content = annotation.domElement.find('.annotation-description-content');
        expect(label.find('b')).toHaveLength(0);
        expect(content.find('b, img[src="x"]')).toHaveLength(0);
        expect(content.find('br')).toHaveLength(1);
        expect(label.text()).toBe("Bob's <b>pile</b> & co");

        await m.save();
        const saved = JSON.parse(stored[PATH]).features[0].properties;
        expect(saved.name).toBe("Bob's <b>pile</b> & co");
        expect(saved.description).toBe('a <b>x</b>\n<img src=x onerror=alert(1)>');
    });

    it('shows the description in its tooltip as text once: the & and the line break are not escaped twice', async () => {
        const { dialogs, annotation } = await start();
        openedDialog(dialogs, annotation).onSave({ name: 'Gate', description: 'Tom & Jerry <3\nsecond' });

        const tooltip = document.querySelector('.potree-annotation-tooltip');
        expect(tooltip.innerHTML).toBe('Tom &amp; Jerry &lt;3<br>second');
        expect(tooltip.textContent).toBe('Tom & Jerry <3second');
        expect(tooltip.querySelectorAll('br')).toHaveLength(1);
    });
});
