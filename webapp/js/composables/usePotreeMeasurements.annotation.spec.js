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
import { UTM_18N_WKT } from '@/libs/map/measurementFormat.fixtures';

vi.mock('@/composables/useMapAlerts', () => ({ flash: vi.fn() }));

// The organization's schema comes from the Registry: the default one here
vi.mock('@/libs/reports/reportSettings', async importOriginal => {
    const actual = await importOriginal();
    return { ...actual, datasetReportSettings: async () => ({ templates: [actual.DEFAULT_TEMPLATE], schema: actual.DEFAULT_SCHEMA }) };
});

const { usePotreeMeasurements } = await import('./usePotreeMeasurements');

const PATH = 'a/cloud_measurements.geojson';
const FILE = {
    type: 'FeatureCollection',
    features: [{
        type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] },
        properties: { measurementType: 'annotation', name: "Gate A & B's", description: 'first\nsecond', localCoordinates: [1, 2, 3], customKey: 5 }
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

async function start({ file = FILE, coordinateSystem = { srs: null }, canWrite = true } = {}) {
    stored = { [PATH]: JSON.stringify(file) };
    const dataset = {
        getFileContents: vi.fn(async path => stored[path]),
        writeObj: vi.fn(async (path, blob) => { stored[path] = await blob.text(); }),
        deleteObj: vi.fn()
    };
    const dialogs = { open: vi.fn(() => ({ close: vi.fn() })) };
    const m = usePotreeMeasurements({ entry: ref({ path: 'a/cloud.laz' }), dataset: ref(dataset), canWrite: ref(canWrite), error: ref(''), dialogs });
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
    m.attach(viewer, session, coordinateSystem);
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
        // The title names what is edited; the name is in its own field
        expect(document.querySelector('#annotation-properties').textContent).toContain('Annotation');
        expect(document.querySelector('#annotation-properties').textContent).toContain('1.000, 2.000, 3.000');
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

describe('the identity and the fields of an annotation', () => {
    it('keeps a property of the file that it does not know, and has an id and a ref after its first save', async () => {
        const { m } = await start();
        await m.save();
        const saved = JSON.parse(stored[PATH]);
        expect(saved.metadata).toMatchObject({ version: '3.0', lastRef: 1 });
        expect(saved.features[0].properties).toMatchObject({ customKey: 5, ref: '1', name: "Gate A & B's" });
        expect(saved.features[0].properties.id).toMatch(/^[0-9a-f]{64}$/);
        expect(saved.features[0].id).toBe(saved.features[0].properties.id);
    });

    it('is saved with the fields the dialog sets, and the dialog shows them next time', async () => {
        const { m, dialogs, annotation } = await start();
        const props = openedDialog(dialogs, annotation);
        expect(props.schema.statuses.map(s => s.id)).toContain('open');
        props.onSave({ name: 'Gate', description: '', ref: 'G-1', category: 'defect', severity: 'high', status: 'open', assignee: 'Anna', dueDate: '2026-12-01', report: false });
        await m.save();
        expect(JSON.parse(stored[PATH]).features[0].properties).toMatchObject({
            ref: 'G-1', category: 'defect', severity: 'high', status: 'open', assignee: 'Anna', dueDate: '2026-12-01', report: false, customKey: 5
        });

        wrapper = mount(AnnotationPropertiesDialog, { props: { annotation, schema: props.schema }, attachTo: document.body, global: { plugins: [PrimeVue] } });
        await flushPromises();
        expect(document.getElementById('ap-ref').value).toBe('G-1');
        expect(document.getElementById('ap-assignee').value).toBe('Anna');
        expect(document.getElementById('ap-due').value).toBe('2026-12-01');
        expect(document.querySelector('#ap-category .p-select-label, [id="ap-category"]').textContent).toContain('Defect');
    });

    it('refuses a ref another annotation has, in the dialog, with its message', async () => {
        const { dialogs, annotation } = await start();
        const props = openedDialog(dialogs, annotation);
        expect(props.isRefTaken('1')).toBe(false);
        wrapper = mount(AnnotationPropertiesDialog, { props: { annotation, schema: props.schema, isRefTaken: ref => ref === '3' }, attachTo: document.body, global: { plugins: [PrimeVue] } });
        await flushPromises();
        const input = document.getElementById('ap-ref');
        input.value = '3';
        input.dispatchEvent(new Event('input'));
        await flushPromises();
        expect(document.getElementById('ap-ref-error').textContent).toBe('Reference 3 is already used');
        expect([...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Save').disabled).toBe(true);
        input.value = '4';
        input.dispatchEvent(new Event('input'));
        await flushPromises();
        expect(document.getElementById('ap-ref-error')).toBeNull();
    });
});

describe('the photos of an annotation', () => {
    const PHOTOS = [{ path: 'images/a.jpg', source: 'coverage', pixel: [10, 20], caption: 'Gate' }];
    const withPhotos = { ...FILE, features: [{ ...FILE.features[0], properties: { ...FILE.features[0].properties, photos: PHOTOS } }] };

    it('gives the dialog the dataset, the file the annotation is saved in, its id, its photos and whether the user can change them', async () => {
        const { dialogs, annotation } = await start({ file: withPhotos });
        const { photoContext } = openedDialog(dialogs, annotation);
        expect(photoContext.measurementPath).toBe(PATH);
        expect(photoContext.itemId).toMatch(/^[0-9a-f]{64}$/);
        expect(photoContext.photos).toEqual(PHOTOS);
        expect(photoContext.readOnly).toBe(false);
        expect(photoContext.dataset.writeObj).toBeTypeOf('function');
    });

    it('says the user cannot change the photos when they cannot write', async () => {
        const { dialogs, annotation } = await start({ canWrite: false });
        expect(openedDialog(dialogs, annotation).photoContext.readOnly).toBe(true);
    });

    it('has no geometry to ask the coverage query about when the cloud has no CRS: such an item is not sent', async () => {
        const { dialogs, annotation } = await start();
        expect(openedDialog(dialogs, annotation).photoContext.geometry).toBeNull();
    });

    it('has the longitude and latitude of the annotation when the cloud has a CRS', async () => {
        const { dialogs, annotation } = await start({ coordinateSystem: { srs: UTM_18N_WKT } });
        const { geometry } = openedDialog(dialogs, annotation).photoContext;
        expect(geometry.type).toBe('Point');
        // zone 18N, 75 W: a point near the origin of the zone is near that meridian
        expect(Math.abs(geometry.coordinates[0] + 79.5)).toBeLessThan(5);
    });

    it('is saved with the photos the dialog sets, keeps them when the dialog does not change them, and drops the key for none', async () => {
        const { m, dialogs, annotation } = await start({ file: withPhotos });
        const props = openedDialog(dialogs, annotation);
        props.onSave({ name: 'Gate', description: '', ref: '1' });
        await m.save();
        expect(JSON.parse(stored[PATH]).features[0].properties.photos).toEqual(PHOTOS);

        const more = [...PHOTOS, { path: 'annotations/x-1.jpg', source: 'upload' }];
        props.onSave({ name: 'Gate', description: '', photos: more });
        await m.save();
        expect(JSON.parse(stored[PATH]).features[0].properties.photos).toEqual(more);

        props.onSave({ name: 'Gate', description: '', photos: undefined });
        await m.save();
        expect(JSON.parse(stored[PATH]).features[0].properties).not.toHaveProperty('photos');
    });
});
