/**
 * The thermal mode of the photo viewer (U-603: FR-RAS-15, FR-XC-24, FR-XC-32, D-022): for the picture of a thermal camera
 * with raw thermal data, the temperature under the pointer (a pixel of the raw thermal grid, from the box the picture is drawn
 * in, whatever the bitmap), its range, the Unit, a palette drawn by thumb-ex with its legend, and the thermal fields in the
 * Information panel. A picture that is not radiometric stays a plain picture. The expected texts are literals.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import PhotoLightbox from './PhotoLightbox.vue';

const INFO = {
    width: 640, height: 512, valueMin: -5.4784, valueMax: 36.5976, unit: '°C', isThermal: true, isDirectValue: false,
    calibration: { emissivity: 0.95, objectDistance: 5, reflectedApparentTemperature: 20, relativeHumidity: 50 }
};
// the same picture in K: the range is 273.15 more
const INFO_K = { ...INFO, unit: 'K', valueMin: 267.6716, valueMax: 309.7476 };

function makeDataset({ info = INFO, point = { value: 10.8586, unit: '°C' } } = {}) {
    return {
        thumbUrl: (path, size) => `/thumb/${path}?size=${size}`,
        thumbExUrl: vi.fn((path, size, viz) => `/thumb-ex/${path}?size=${size}&formula=${viz.formula}&colormap=${viz.colormap}`),
        downloadUrl: (path, options) => `/download/${path}${options?.inline ? '?inline=1' : ''}`,
        getRasterValueInfo: vi.fn(async (path, options) => (options?.formula === 'KELVIN' ? INFO_K : info)),
        getRasterPointValue: vi.fn(async () => point)
    };
}

// A radiometric picture: a FLIR R-JPEG with the Planck constants in its tags (ddb gives its temperatures)
const thermalPhoto = (path = 'FLIR/IR_0001.jpg') => ({
    path,
    entry: { type: 6, path, size: 1263519, properties: { width: 640, height: 512, sensorCategory: 'thermal', make: 'FLIR Systems AB',
        model: 'FLIR Vue Pro R' } }
});
// A DJI R-JPEG: ddb gives its raw counts, without a unit and without a calibration (they need DJI's own conversion)
const djiPhoto = (path = 'H20T/DJI_0001_R.JPG') => ({
    path,
    entry: { type: 6, path, size: 1263519, properties: { width: 640, height: 512, sensorCategory: 'thermal', make: 'DJI', model: 'ZH20T' } }
});
const DJI_RAW_INFO = { width: 640, height: 512, valueMin: 13537, valueMax: 20670, unit: '', isThermal: true, isDirectValue: false,
    dataType: 'UInt16', stretch: [{ min: 13537, max: 20670 }] };
const plainPhoto = path => ({ path, entry: { type: 6, path, size: 1234, properties: { width: 6000, height: 4000 } } });

const mounted = [];
async function open(dataset, photos) {
    const w = mount(PhotoLightbox, {
        props: { dataset, photos, index: 0 }, attachTo: document.body, global: { plugins: [PrimeVue] }
    });
    mounted.push(w);
    await flushPromises();
    return w;
}
const q = sel => document.querySelector(sel);
const img = () => q('.photo-lightbox-image');

// The picture is drawn in a 960 x 768 box at (100, 50): jsdom has no layout
function drawPictureAt(left, top, width, height) {
    img().getBoundingClientRect = () => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top });
}
async function pointerAt(x, y) {
    q('.photo-lightbox-stage').dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y, bubbles: true }));
    await flushPromises();
}

beforeEach(() => {
    window.innerWidth = 1920;
    window.innerHeight = 1080;
    Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true });
});
afterEach(async () => {
    mounted.splice(0).forEach(w => w.unmount());
    // The focus trap of the dialog observes the DOM from a timer: let it run before the page is emptied
    await new Promise(resolve => setTimeout(resolve, 20));
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('PhotoLightbox: the thermal mode', () => {
    it('shows the range, the unit and the palette of a radiometric picture, and asks the value info of its grid', async () => {
        const dataset = makeDataset();
        await open(dataset, [thermalPhoto()]);
        expect(dataset.getRasterValueInfo).toHaveBeenCalledWith('FLIR/IR_0001.jpg', { formula: 'CELSIUS' });
        expect(q('[aria-label="Thermal image"]')).not.toBeNull();
        expect(q('[data-testid="thermal-range"]').textContent).toBe('Range -5.5 °C to 36.6 °C');
        expect([...q('[data-testid="thermal-unit"]').options].map(o => o.textContent)).toEqual(['Celsius (°C)', 'Kelvin (K)', 'Fahrenheit (°F)']);
        expect(q('.colormap-label').textContent).toBe('As shot');
        // as shot: the picture itself, no legend
        expect(img().getAttribute('src')).toContain('/download/FLIR/IR_0001.jpg');
        expect(q('[data-testid="raster-legend"]')).toBeNull();
    });

    it('reads the temperature under the pointer: the pixel of the raw grid, at one display size', async () => {
        const dataset = makeDataset();
        await open(dataset, [thermalPhoto()]);
        drawPictureAt(100, 50, 960, 768);
        await pointerAt(580, 434);
        expect(dataset.getRasterPointValue).toHaveBeenLastCalledWith('FLIR/IR_0001.jpg', 320, 256, { formula: 'CELSIUS' });
        expect(q('[data-testid="thermal-readout"]').textContent).toContain('10.9 °C');
        expect(q('[data-testid="thermal-readout"]').textContent).toContain('at 320, 256');
    });

    it('reads the same pixel when the picture is drawn at another size', async () => {
        const dataset = makeDataset();
        await open(dataset, [thermalPhoto()]);
        drawPictureAt(10, 20, 320, 256);
        await pointerAt(170, 148);
        expect(dataset.getRasterPointValue).toHaveBeenLastCalledWith('FLIR/IR_0001.jpg', 320, 256, { formula: 'CELSIUS' });
    });

    it('asks nothing off the picture, and clears the reading when the pointer leaves', async () => {
        const dataset = makeDataset();
        await open(dataset, [thermalPhoto()]);
        drawPictureAt(100, 50, 960, 768);
        await pointerAt(10, 10);
        expect(dataset.getRasterPointValue).not.toHaveBeenCalled();
        await pointerAt(580, 434);
        expect(q('[data-testid="thermal-readout"]').textContent).toContain('10.9 °C');
        q('.photo-lightbox-stage').dispatchEvent(new MouseEvent('pointerleave', { bubbles: false }));
        await flushPromises();
        expect(q('[data-testid="thermal-readout"]').textContent).toContain('Move the pointer');
    });

    it('keeps one request in flight and reads the last pixel after it (the pointer is throttled)', async () => {
        const dataset = makeDataset();
        let release;
        dataset.getRasterPointValue = vi.fn(() => new Promise(resolve => { release = () => resolve({ value: 11.5, unit: '°C' }); }));
        await open(dataset, [thermalPhoto()]);
        drawPictureAt(0, 0, 640, 512);
        await pointerAt(1, 1);
        await pointerAt(2, 2);
        await pointerAt(3, 3);
        expect(dataset.getRasterPointValue).toHaveBeenCalledTimes(1);
        release();
        await flushPromises();
        // the last pixel, not the ones in between
        expect(dataset.getRasterPointValue).toHaveBeenCalledTimes(2);
        expect(dataset.getRasterPointValue).toHaveBeenLastCalledWith('FLIR/IR_0001.jpg', 3, 3, { formula: 'CELSIUS' });
        release();
        await flushPromises();
        expect(q('[data-testid="thermal-readout"]').textContent).toContain('11.5 °C');
    });

    it('asks ddb for the unit the user picks: the range and the readings come back in it (the Hub does not convert)', async () => {
        const dataset = makeDataset();
        dataset.getRasterPointValue = vi.fn(async (path, x, y, options) => (options.formula === 'KELVIN'
            ? { value: 284.0086, unit: 'K' } : { value: 10.8586, unit: '°C' }));
        await open(dataset, [thermalPhoto()]);
        const select = q('[data-testid="thermal-unit"]');
        select.value = 'KELVIN';
        select.dispatchEvent(new Event('change'));
        await flushPromises();
        expect(dataset.getRasterValueInfo).toHaveBeenLastCalledWith('FLIR/IR_0001.jpg', { formula: 'KELVIN' });
        expect(q('[data-testid="thermal-range"]').textContent).toBe('Range 267.7 K to 309.7 K');
        drawPictureAt(100, 50, 960, 768);
        await pointerAt(580, 434);
        expect(dataset.getRasterPointValue).toHaveBeenLastCalledWith('FLIR/IR_0001.jpg', 320, 256, { formula: 'KELVIN' });
        expect(q('[data-testid="thermal-readout"]').textContent).toContain('284.0 K');
    });

    it('draws a palette through thumb-ex, in the steps of the stage, with its legend over the range in the unit', async () => {
        const dataset = makeDataset();
        await open(dataset, [thermalPhoto()]);
        q('.colormap-trigger').click();
        await flushPromises();
        const option = [...document.querySelectorAll('.colormap-option')].find(o => o.textContent.includes('Ironbow'));
        option.click();
        await flushPromises();
        // the bitmap is the stage in device pixels (1920 at ratio 1: the 2048 step), never above the picture's long side (640)
        expect(dataset.thumbExUrl).toHaveBeenLastCalledWith('FLIR/IR_0001.jpg', 640, { formula: 'CELSIUS', colormap: 'ironbow' });
        expect(img().getAttribute('src')).toBe('/thumb-ex/FLIR/IR_0001.jpg?size=640&formula=CELSIUS&colormap=ironbow');
        expect(q('[data-testid="raster-legend-min"]').textContent).toBe('-5.5 °C');
        expect(q('[data-testid="raster-legend-max"]').textContent).toBe('36.6 °C');
    });

    it('goes back to the picture as shot when the palette does not load', async () => {
        const dataset = makeDataset();
        await open(dataset, [thermalPhoto()]);
        q('.colormap-trigger').click();
        await flushPromises();
        [...document.querySelectorAll('.colormap-option')].find(o => o.textContent.includes('Lava')).click();
        await flushPromises();
        expect(img().getAttribute('src')).toContain('/thumb-ex/');
        img().dispatchEvent(new Event('error'));
        await flushPromises();
        expect(img().getAttribute('src')).not.toContain('/thumb-ex/');
        expect(q('.photo-lightbox-failed')).toBeNull();
    });

    it('lists the thermal fields in the Information panel', async () => {
        const dataset = makeDataset();
        const w = await open(dataset, [thermalPhoto()]);
        q('[aria-label="Information"]').click();
        await w.vm.$nextTick();
        const text = q('.photo-lightbox-info').textContent;
        // the table writes the sensor in capitals
        expect(text).toContain('FLIR SYSTEMS AB FLIR VUE PRO R');
        expect(text).toContain('0.95');
        expect(text).toContain('5.0 m');
        expect(text).toContain('-5.5 °C to 36.6 °C');
    });

    it('stays a plain picture when the thermal picture has no raw thermal data (no unit, no calibration)', async () => {
        const dataset = makeDataset({ info: { ...INFO, unit: '', calibration: undefined, isDirectValue: false } });
        await open(dataset, [thermalPhoto()]);
        expect(dataset.getRasterValueInfo).toHaveBeenCalled();
        expect(q('[aria-label="Thermal image"]')).toBeNull();
        expect(q('[data-testid="thermal-notice"]').textContent.trim())
            .toBe('No thermal calibration data: showing the picture as shot, without temperatures.');
        drawPictureAt(0, 0, 640, 512);
        await pointerAt(10, 10);
        expect(dataset.getRasterPointValue).not.toHaveBeenCalled();
    });

    it('shows a DJI R-JPEG as shot, with the notice that its temperatures need DJI\'s conversion: no readout, no palette', async () => {
        const dataset = makeDataset({ info: DJI_RAW_INFO });
        const w = await open(dataset, [djiPhoto()]);
        expect(dataset.getRasterValueInfo).toHaveBeenCalledWith('H20T/DJI_0001_R.JPG', { formula: 'CELSIUS' });
        expect(q('[aria-label="Thermal image"]')).toBeNull();
        expect(q('[data-testid="thermal-notice"]').textContent.trim()).toBe('No thermal calibration data: showing the picture as '
            + 'shot, without temperatures. The temperatures of a DJI picture need DJI\'s own conversion of its raw sensor values, '
            + 'which is not available yet.');
        // the picture itself, no palette and no legend
        expect(img().getAttribute('src')).toContain('/download/H20T/DJI_0001_R.JPG');
        expect(q('.colormap-trigger')).toBeNull();
        expect(q('[data-testid="raster-legend"]')).toBeNull();
        expect(dataset.thumbExUrl).not.toHaveBeenCalled();
        // no reading under the pointer: raw counts are no temperatures
        drawPictureAt(0, 0, 640, 512);
        await pointerAt(10, 10);
        expect(dataset.getRasterPointValue).not.toHaveBeenCalled();
        // no thermal fields in the Information panel (no range of temperatures)
        q('[aria-label="Information"]').click();
        await w.vm.$nextTick();
        expect(q('.photo-lightbox-info').textContent).not.toContain('13537');
    });

    it('shows no notice for a radiometric picture, nor for a picture that is not thermal', async () => {
        await open(makeDataset(), [thermalPhoto()]);
        expect(q('[data-testid="thermal-notice"]')).toBeNull();
        mounted.splice(0).forEach(w => w.unmount());
        await open(makeDataset(), [plainPhoto('a.jpg')]);
        expect(q('[data-testid="thermal-notice"]')).toBeNull();
    });

    it('stays a plain picture when the value info fails', async () => {
        const dataset = makeDataset();
        dataset.getRasterValueInfo = vi.fn(async () => { throw new Error('400'); });
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        await open(dataset, [thermalPhoto()]);
        expect(q('[aria-label="Thermal image"]')).toBeNull();
    });

    it('asks nothing for a picture that is not thermal', async () => {
        const dataset = makeDataset();
        await open(dataset, [plainPhoto('a.jpg')]);
        expect(dataset.getRasterValueInfo).not.toHaveBeenCalled();
        expect(q('[aria-label="Thermal image"]')).toBeNull();
    });

    it('keeps the unit and the palette from one thermal picture to the next, with the new picture range', async () => {
        const dataset = makeDataset();
        const w = await open(dataset, [thermalPhoto('a/IR_0001.jpg'), thermalPhoto('a/IR_0002.jpg')]);
        q('.colormap-trigger').click();
        await flushPromises();
        [...document.querySelectorAll('.colormap-option')].find(o => o.textContent.includes('Ironbow')).click();
        await flushPromises();
        // the focus is in the dialog, as a user's is (the menu that closed had it)
        q('[aria-label="Close"]').focus();
        await w.setProps({ index: 1 });
        await flushPromises();
        expect(dataset.getRasterValueInfo).toHaveBeenLastCalledWith('a/IR_0002.jpg', { formula: 'CELSIUS' });
        expect(img().getAttribute('src')).toContain('/thumb-ex/a/IR_0002.jpg');
    });
});
