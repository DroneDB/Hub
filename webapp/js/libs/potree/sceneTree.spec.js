/**
 * The names of measures and annotations inside Potree are HTML: its scene tree (a jsTree) parses the text of a node as
 * HTML, which gives its own category headers their <b>. The tree keeps its headers, and a name that a saved file brings
 * shows as the text that was saved, with no element made of it. The real Potree and jsTree run; the tree is made as
 * Potree's sidebar makes it, from the same options and texts.
 */
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { loadPotree } from './potreeLibs.fixtures';
import { exportMeasurements, importMeasurements } from '@/libs/map/potreeMeasurementConverter';
import { updateNameLabel } from './measureLabels';
import { measureAsFeature, assignMeasureProperties } from './measureStyle';

const NAME = 'Gate A & B <img src=x onerror=alert(1)>';
const HEADERS = ['<b>Point Clouds</b>', '<b>Measurements</b>', '<b>Annotations</b>', '<b>Other</b>', '<b>Vectors</b>', '<b> Images</b>'];

// The sprites of the labels of a measure draw their text on a canvas: a context that takes everything and draws nothing
const context2d = new Proxy({}, {
    get: (target, key) => (key in target ? target[key] : key === 'measureText' ? () => ({ width: 10 }) : () => {}),
    set: (target, key, value) => { target[key] = value; return true; }
});

let Potree;
beforeAll(() => {
    Potree = loadPotree();
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) { return type === '2d' ? context2d : original.call(this, type, ...args); };
});
afterEach(() => { document.body.innerHTML = ''; });

/** The scene tree as the sidebar of Potree builds it: its options, its headers, and a node for what the scene gets */
function sceneTree() {
    const tree = window.$('<div id="jstree_scene"></div>').appendTo(document.body);
    tree.jstree({
        plugins: ['checkbox', 'state'],
        core: { dblclick_toggle: false, state: { checked: true }, check_callback: true, expand_selected_onload: true },
        checkbox: { keep_selected_style: true, three_state: false, whole_node: false, tie_selection: false }
    });
    const ids = ['pointclouds', 'measurements', 'annotations', 'other', 'vectors', 'images'];
    HEADERS.forEach((text, i) => tree.jstree('create_node', '#', { text, id: ids[i] }, 'last', false, false));
    const add = (parent, text) => tree.jstree('create_node', parent, { text }, 'last', false, false);
    // What it does for a measurement and an annotation: the name (the title) is the text of the node
    const viewer = {
        scene: {
            addMeasurement: m => add('measurements', m.name),
            annotations: { add: a => add('annotations', a.title) }
        }
    };
    return { tree, viewer };
}

const coordinateSystem = { srs: null, scale: [1, 1, 1], offset: [0, 0, 0] };
const feature = properties => ({
    type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] },
    properties: { localCoordinates: [[1, 2, 3]], ...properties }
});

describe('the scene tree of Potree', () => {
    it('keeps the bold category headers', () => {
        const { tree } = sceneTree();
        const headers = tree.find('li[id] > a.jstree-anchor');
        expect(headers).toHaveLength(6);
        headers.each((_, a) => expect(a.querySelector('b')).not.toBeNull());
        expect(tree.find('#measurements > a b').text()).toBe('Measurements');
    });

    it('shows a measure and an annotation named like markup as that text, and makes no element of it', () => {
        const { tree, viewer } = sceneTree();
        importMeasurements({ features: [
            feature({ measurementType: 'distance', name: NAME, localCoordinates: [[1, 2, 3], [4, 5, 6]] }),
            feature({ measurementType: 'annotation', name: NAME, description: '' })
        ] }, viewer, coordinateSystem);

        tree.jstree('open_all');
        const measureNode = tree.find('#measurements li > a');
        const annotationNode = tree.find('#annotations li > a');
        expect(measureNode.text()).toBe(NAME);
        expect(annotationNode.text()).toBe(NAME);
        expect(tree.find('img')).toHaveLength(0);
        // The headers are still bold
        expect(tree.find('#measurements > a b').text()).toBe('Measurements');
    });
});

describe('the name of a measure', () => {
    it('is the text of the file after the trip into Potree and back', () => {
        const { viewer } = sceneTree();
        const { imported: [measure] } = importMeasurements({ features: [feature({ measurementType: 'distance', name: NAME, localCoordinates: [[1, 2, 3], [4, 5, 6]] })] }, viewer, coordinateSystem);

        const doc = exportMeasurements({ scene: { measurements: [measure], annotations: { traverse: () => {} } } }, 'cloud.laz', coordinateSystem);

        expect(measure.name).toBe('Gate A &amp; B &lt;img src=x onerror=alert(1)&gt;');
        expect(doc.features[0].properties.name).toBe(NAME);
    });

    it('is shown as text in the properties dialog, and what is typed there is escaped into Potree', () => {
        const m = { name: 'Tom &amp; &lt;Jerry&gt;', points: [], children: [] };
        expect(measureAsFeature(m).get('name')).toBe('Tom & <Jerry>');

        assignMeasureProperties(m, { name: 'a & <b>' });

        expect(m.name).toBe('a &amp; &lt;b&gt;');
    });

    it('is shown in its label and its tooltip as the text, & once', () => {
        const THREE = globalThis.THREE;
        const sprites = [];
        const real = Potree.TextSprite;
        Potree.TextSprite = class extends THREE.Object3D {
            constructor(text) {
                super();
                sprites.push(text);
                this.material = {};
                Object.assign(this, { setTextColor() {}, setBorderColor() {}, setBackgroundColor() {} });
            }
        };
        try {
            const measure = Object.assign(new THREE.Object3D(), {
                name: 'Tom &amp; Jerry &lt;3', description: 'a & b', points: [{ position: new THREE.Vector3(1, 2, 3) }]
            });
            const viewer = { scene: { getActiveCamera: () => ({ position: new THREE.Vector3() }) }, renderer: { domElement: document.createElement('canvas') } };
            const session = { track: vi.fn(), untrack: vi.fn(), adopt: el => el };

            updateNameLabel(measure, { viewer, session });

            expect(sprites).toEqual(['Tom & Jerry <3']);
            expect(measure._nameLabelTooltip.querySelector('strong').textContent).toBe('Tom & Jerry <3');
            expect(measure._nameLabelTooltip.innerHTML).toBe('<strong>Tom &amp; Jerry &lt;3</strong><br>a &amp; b');
        } finally {
            Potree.TextSprite = real;
        }
    });
});

