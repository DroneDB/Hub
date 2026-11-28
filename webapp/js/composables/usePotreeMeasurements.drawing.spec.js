/**
 * Save while a measure is being drawn, with the real measuring tool, input handler and measures of the vendored Potree and
 * the real gestures, converter and storage. Potree puts a measure in the scene when it starts, with a marker at the origin
 * of the coordinates that follows the pointer: Save ends the measure as a right click does, so the file gets the points
 * that were placed and never that marker (in a UTM zone, the origin is thousands of kilometres from the cloud).
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { ref } from 'vue';
import { loadPotree } from '@/libs/potree/potreeLibs.fixtures';
import { createMeasuringViewer, inputOn } from '@/libs/potree/potreeMeasuring.fixtures';
import { PotreeMeasureGestures } from '@/libs/potree/measureGestures';
import { useTestScope } from '@/composables/testScope.fixtures';

// The composable's scope ends with each test: its timers never fire after the test environment is torn down
const inTestScope = useTestScope();

vi.mock('@/composables/useMapAlerts', () => ({ flash: vi.fn() }));
vi.mock('@/libs/reports/reportSettings', async importOriginal => {
    const actual = await importOriginal();
    return { ...actual, datasetReportSettings: async () => ({ templates: [actual.DEFAULT_TEMPLATE], schema: actual.DEFAULT_SCHEMA }) };
});

const { usePotreeMeasurements } = await import('./usePotreeMeasurements');

const PATH = 'site/cloud_measurements.geojson';

beforeAll(() => { loadPotree({ internals: ['InputHandler'] }); });

let stored;
let viewer;
let input;
let gestures;
let m;
let error;
let tracked;

beforeEach(async () => {
    stored = {};
    const dataset = {
        getFileContents: vi.fn(async path => {
            if (!(path in stored)) throw Object.assign(new Error('Not found'), { status: 404 });
            return stored[path];
        }),
        writeObj: vi.fn(async (path, blob) => { stored[path] = await blob.text(); }),
        deleteObj: vi.fn(async path => { delete stored[path]; })
    };
    let canvas;
    let cloud;
    ({ viewer, canvas, cloud } = createMeasuringViewer());
    // The cloud lies 500 m away from the origin of its coordinates
    cloud.at = (x, y) => ({ x: 500 + x, y: 500 + y, z: 10 });
    input = inputOn(canvas);
    tracked = [];
    const session = {
        track: (target, type, fn, options) => { target.addEventListener(type, fn, options); tracked.push([target, type, fn, options]); },
        untrack: (target, type, fn) => target.removeEventListener(type, fn),
        adopt: el => el
    };
    error = ref('');
    // As the viewer wires them: Save ends the measure being drawn as a right click does
    m = inTestScope(() => usePotreeMeasurements({
        entry: ref({ path: 'site/cloud.laz' }), dataset: ref(dataset), canWrite: ref(true), error, dialogs: { open: vi.fn() },
        endDrawing: () => gestures.finish({ dropShort: true })
    }));
    gestures = new PotreeMeasureGestures({ viewer, session, discard: measure => { m.discardMeasure(measure); viewer.scene.removeMeasurement(measure); }, later: fn => fn() });
    m.attach(viewer, session, { srs: null });
    await m.load();
});
afterEach(() => {
    tracked.forEach(([target, type, fn, options]) => target.removeEventListener(type, fn, options));
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

const saved = () => (PATH in stored ? JSON.parse(stored[PATH]).features.map(f => f.properties.localCoordinates) : null);

describe('Save while a measure is drawn, with the real Potree', () => {
    it('writes no point that no tap placed: the Point at the origin is not saved, and the tool ends', async () => {
        gestures.start('point');
        expect(viewer.scene.measurements).toHaveLength(1);

        await m.save();

        expect(saved()).toBeNull();
        expect(error.value).toBe('No measurements to save');
        expect(gestures.activeKind).toBeNull();
        expect(viewer.scene.measurements).toEqual([]);
    });

    it('writes the points of a distance that were placed, without the marker that follows the pointer', async () => {
        gestures.start('distance');
        input.tap(10, 10);
        input.tap(40, 50);
        input.move(90, 90);

        await m.save();

        expect(saved()).toEqual([[[510, 510, 10], [540, 550, 10]]]);
        expect(gestures.activeKind).toBeNull();
    });

    it('keeps a measure already finished and drops the one just started', async () => {
        gestures.start('point');
        input.tap(20, 30);
        expect(gestures.activeKind).toBeNull();
        gestures.start('point');

        await m.save();

        expect(saved()).toEqual([[[520, 530, 10]]]);
    });
});
