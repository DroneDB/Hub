/**
 * The Photos tab of an annotation: the photos that cover it (best first, with the "Approximate location" marker where
 * the pixel is known), the photos it has (caption, remove, the limit of 12), picking from the dataset and uploading,
 * and the states: loading, none found, error with Retry, not georeferenced (no request), read-only.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import AnnotationPhotos from './AnnotationPhotos.vue';

const POINT = { type: 'Point', coordinates: [11.2, 45.1] };
const entriesOf = paths => paths.map(path => ({ path, hash: `h-${path}`, properties: { width: 4000, height: 3000 } }));

function makeDataset(overrides = {}) {
    return {
        thumbUrl: vi.fn((path, size, hash) => `/thumb?path=${path}&size=${size}&v=${hash}`),
        findCoverage: vi.fn(async () => []),
        list: vi.fn(async () => []),
        search: vi.fn(async () => []),
        writeObj: vi.fn(async () => ({})),
        deleteObj: vi.fn(async () => ({})),
        deleteObjs: vi.fn(async () => ({})),
        ...overrides
    };
}

let wrapper;
async function show({ dataset = makeDataset(), ...props } = {}) {
    wrapper = mount(AnnotationPhotos, {
        props: { dataset, geometry: POINT, itemId: 'item-1', itemName: 'Crack', measurementPath: 'site/survey_measurements.geojson', ...props },
        attachTo: document.body,
        global: { plugins: [PrimeVue] }
    });
    await flushPromises();
    return { dataset, wrapper };
}
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
});

const coverageRows = () => [...document.querySelectorAll('[data-testid="coverage-list"] li')];
const nameOf = row => row.querySelector('.photo-name').textContent;
const buttonNamed = (root, name) => [...root.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === name || b.textContent.trim() === name);
const lastModel = () => wrapper.emitted('update:modelValue').at(-1)[0];
const photo = (path, extra = {}) => ({ path, source: 'dataset', ...extra });

const RESULTS = [
    { path: 'images/best.jpg', score: 0.05, overlap: 1, pixel: [1000, 750] },
    { path: 'images/second.jpg', score: 0.2, overlap: 1, pixel: null },
    { path: 'other/third.jpg', score: 0.5, overlap: 1, pixel: [4000, 3000] }
];

describe('the photos that cover the annotation', () => {
    it('asks for the geometry of the annotation and lists the results in the order given, with thumbnails and alternative texts', async () => {
        const dataset = makeDataset({ findCoverage: vi.fn(async () => RESULTS), list: vi.fn(async folder => entriesOf(folder === 'images' ? ['images/best.jpg', 'images/second.jpg'] : ['other/third.jpg'])) });
        await show({ dataset });
        expect(dataset.findCoverage).toHaveBeenCalledTimes(1);
        expect(dataset.findCoverage.mock.calls[0][0]).toEqual(POINT);
        expect(dataset.findCoverage.mock.calls[0][1]).toMatchObject({ limit: 20 });
        const rows = coverageRows();
        expect(rows.map(nameOf)).toEqual(['best.jpg', 'second.jpg', 'third.jpg']);
        expect(rows.map(r => r.querySelector('.photo-source').textContent)).toEqual(['Best match', 'Match 2', 'Match 3']);
        const images = rows.map(r => r.querySelector('img'));
        expect(images.map(i => i.getAttribute('alt'))).toEqual(['Crack - best.jpg', 'Crack - second.jpg', 'Crack - third.jpg']);
        expect(images[0].getAttribute('src')).toContain('path=images/best.jpg');
        expect(images[0].getAttribute('src')).toContain('v=h-images/best.jpg');
    });

    it('draws the "Approximate location" marker only for a result with a pixel, at the scaled position', async () => {
        const dataset = makeDataset({ findCoverage: vi.fn(async () => RESULTS), list: vi.fn(async folder => entriesOf(folder === 'images' ? ['images/best.jpg', 'images/second.jpg'] : ['other/third.jpg'])) });
        await show({ dataset });
        const markers = coverageRows().map(r => r.querySelector('[data-testid="location-marker"]'));
        expect(markers[0]).toBeTruthy();
        expect(markers[0].getAttribute('title')).toBe('Approximate location');
        expect(markers[0].getAttribute('aria-label')).toBe('Approximate location');
        expect(markers[0].style.left).toBe('25%');
        expect(markers[0].style.top).toBe('25%');
        expect(markers[1]).toBeNull();
        expect(markers[2].style.left).toBe('100%');
    });

    it('draws no marker when the size of the image is not known', async () => {
        const dataset = makeDataset({ findCoverage: vi.fn(async () => RESULTS), list: vi.fn(async () => { throw new Error('no'); }) });
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        await show({ dataset });
        expect(document.querySelectorAll('[data-testid="location-marker"]')).toHaveLength(0);
        expect(coverageRows()).toHaveLength(3);
    });

    it('says it is looking while the request is open', async () => {
        let resolve;
        const dataset = makeDataset({ findCoverage: vi.fn(() => new Promise(r => { resolve = r; })) });
        await show({ dataset });
        expect(document.querySelector('[role="status"]').textContent).toMatch(/Looking for photos/);
        resolve([]);
        await flushPromises();
        expect(document.body.textContent).not.toMatch(/Looking for photos/);
    });

    it('says when there are none', async () => {
        await show();
        expect(document.body.textContent).toContain('No covering photos found');
    });

    it('shows the error with Retry, which asks again', async () => {
        const findCoverage = vi.fn()
            .mockRejectedValueOnce(Object.assign(new Error('The geometry is too large'), { status: 400 }))
            .mockResolvedValue(RESULTS);
        await show({ dataset: makeDataset({ findCoverage }) });
        const alert = document.querySelector('[role="alert"]');
        expect(alert.textContent).toContain('The geometry is too large');
        buttonNamed(alert, 'Retry').click();
        await flushPromises();
        expect(findCoverage).toHaveBeenCalledTimes(2);
        expect(coverageRows()).toHaveLength(3);
        expect(document.querySelector('[role="alert"]')).toBeNull();
    });

    it('makes no request for an item that is not georeferenced, and says why', async () => {
        const { dataset } = await show({ geometry: null });
        expect(dataset.findCoverage).not.toHaveBeenCalled();
        expect(document.querySelector('[data-testid="coverage-unlocated"]').textContent).toMatch(/no position on the earth/);
        // pick and upload are still offered
        expect(buttonNamed(document.body, 'Upload photos')).toBeTruthy();
        expect(buttonNamed(document.body, 'Pick from the dataset')).toBeTruthy();
    });

    it('leaves out a result whose path is not a path of the dataset', async () => {
        const dataset = makeDataset({ findCoverage: vi.fn(async () => [{ path: '../secret.jpg', pixel: null }, { path: 'ok.jpg', pixel: null }]) });
        await show({ dataset });
        expect(coverageRows().map(nameOf)).toEqual(['ok.jpg']);
    });
});

describe('adding a covering photo', () => {
    it('pins it with its source and its pixel, and the button then says it is there', async () => {
        const dataset = makeDataset({ findCoverage: vi.fn(async () => RESULTS) });
        await show({ dataset });
        buttonNamed(coverageRows()[0], 'Add best.jpg to this annotation').click();
        await flushPromises();
        expect(lastModel()).toEqual([{ path: 'images/best.jpg', source: 'coverage', pixel: [1000, 750] }]);
        const again = buttonNamed(coverageRows()[0], 'Add best.jpg to this annotation');
        expect(again.getAttribute('aria-disabled')).toBe('true');
        again.click();
        expect(wrapper.emitted('update:modelValue')).toHaveLength(1);
    });

    it('pins a result with no pixel without one', async () => {
        const dataset = makeDataset({ findCoverage: vi.fn(async () => RESULTS) });
        await show({ dataset });
        buttonNamed(coverageRows()[1], 'Add second.jpg to this annotation').click();
        expect(lastModel()).toEqual([{ path: 'images/second.jpg', source: 'coverage' }]);
    });

    it('is refused at 12 photos, with the reason shown and as the description of the button', async () => {
        const twelve = Array.from({ length: 12 }, (_, i) => photo(`p${i}.jpg`));
        const dataset = makeDataset({ findCoverage: vi.fn(async () => RESULTS) });
        await show({ dataset, modelValue: twelve });
        expect(document.querySelector('[data-testid="photos-limit"]').textContent).toMatch(/at most 12/);
        const add = buttonNamed(coverageRows()[0], 'Add best.jpg to this annotation');
        expect(add.getAttribute('aria-disabled')).toBe('true');
        expect(add.getAttribute('aria-describedby')).toBeTruthy();
        add.click();
        expect(wrapper.emitted('update:modelValue')).toBeUndefined();
        expect(buttonNamed(document.body, 'Upload photos').getAttribute('aria-disabled')).toBe('true');
        expect(buttonNamed(document.body, 'Pick from the dataset').getAttribute('aria-disabled')).toBe('true');
    });
});

describe('the photos the annotation has', () => {
    it('lists them with their caption and the marker of the pixel that was stored', async () => {
        const dataset = makeDataset({ list: vi.fn(async () => entriesOf(['images/a.jpg', 'images/b.jpg'])) });
        await show({ dataset, modelValue: [photo('images/a.jpg', { source: 'coverage', pixel: [2000, 1500], caption: 'North wall' }), photo('images/b.jpg')] });
        const rows = [...document.querySelectorAll('.annotation-photos > section:first-child li')];
        expect(rows.map(nameOf)).toEqual(['a.jpg', 'b.jpg']);
        expect(rows[0].querySelector('img').getAttribute('alt')).toBe('Crack - North wall');
        expect(rows[1].querySelector('img').getAttribute('alt')).toBe('Crack - b.jpg');
        expect(rows[0].querySelector('[data-testid="location-marker"]').style.left).toBe('50%');
        expect(rows[1].querySelector('[data-testid="location-marker"]')).toBeNull();
        expect(rows[0].querySelector('input').value).toBe('North wall');
        expect(document.querySelector('.photos-count').textContent).toBe('(2 of 12)');
    });

    it('says there are none', async () => {
        await show();
        expect(document.body.textContent).toContain('No photos yet');
    });

    it('removes a photo from the annotation and never deletes the dataset file', async () => {
        const dataset = makeDataset();
        await show({ dataset, modelValue: [photo('a.jpg'), photo('b.jpg', { source: 'upload' })] });
        buttonNamed(document.body, 'Remove b.jpg').click();
        expect(lastModel()).toEqual([photo('a.jpg')]);
        buttonNamed(document.body, 'Remove a.jpg').click();
        expect(lastModel()).toEqual([]);
        expect(dataset.deleteObj).not.toHaveBeenCalled();
        expect(dataset.deleteObjs).not.toHaveBeenCalled();
    });

    it('sets a caption of at most 200 characters', async () => {
        await show({ modelValue: [photo('a.jpg')] });
        const input = document.querySelector('.photo-caption');
        expect(input.getAttribute('maxlength')).toBe('200');
        expect(document.querySelector(`label[for="${input.id}"]`).textContent).toBe('Caption of a.jpg');
        input.value = 'Rust on the rail';
        input.dispatchEvent(new Event('input'));
        expect(lastModel()).toEqual([photo('a.jpg', { caption: 'Rust on the rail' })]);
    });

    it('follows the list its parent gives', async () => {
        await show({ modelValue: [photo('a.jpg')] });
        await wrapper.setProps({ modelValue: [photo('a.jpg'), photo('b.jpg')] });
        expect(document.querySelector('.photos-count').textContent).toBe('(2 of 12)');
    });

    it('shows a photo whose path is not the dataset\'s without asking for it, and lets it be removed', async () => {
        const dataset = makeDataset();
        await show({ dataset, modelValue: [photo('../../etc/passwd'), photo('https://evil.example/x.jpg')] });
        expect(document.querySelectorAll('.annotation-photos img')).toHaveLength(0);
        expect(dataset.thumbUrl).not.toHaveBeenCalled();
        expect(dataset.list).not.toHaveBeenCalled();
        expect(document.body.textContent).toContain('Not a path of this dataset');
        buttonNamed(document.body, 'Remove passwd').click();
        expect(lastModel()).toHaveLength(1);
    });

    it('shows a note for an image that cannot be loaded', async () => {
        await show({ modelValue: [photo('gone.jpg')] });
        document.querySelector('.annotation-photos img').dispatchEvent(new Event('error'));
        await flushPromises();
        expect(document.body.textContent).toContain('The image is not in the dataset');
    });
});

describe('a user who cannot change the annotation', () => {
    it('sees the photos and the covering photos, with no way to add, remove, caption or upload', async () => {
        const dataset = makeDataset({ findCoverage: vi.fn(async () => RESULTS) });
        await show({ dataset, readOnly: true, modelValue: [photo('a.jpg', { caption: 'North wall' })] });
        expect(document.querySelectorAll('.annotation-photos img').length).toBeGreaterThan(1);
        expect(document.body.textContent).toContain('North wall');
        expect(document.querySelector('input')).toBeNull();
        expect([...document.querySelectorAll('button')].map(b => b.textContent.trim())).toEqual([]);
        expect(coverageRows()).toHaveLength(3);
    });
});

describe('picking an image of the dataset', () => {
    it('searches the dataset, lists the images and adds one with the source dataset', async () => {
        // The two picture types are searched: the geoimages are the ones that have a place
        const dataset = makeDataset({ search: vi.fn(async (_query, { type }) => (type === 3 ? [{ path: 'roof/a.jpg', hash: 'x' }, { path: 'roof/b.jpg' }] : [])) });
        await show({ dataset, modelValue: [photo('roof/b.jpg')] });
        buttonNamed(document.body, 'Pick from the dataset').click();
        await flushPromises();
        expect(buttonNamed(document.body, 'Pick from the dataset').getAttribute('aria-expanded')).toBe('true');
        expect(dataset.search).toHaveBeenCalled();
        const rows = [...document.querySelectorAll('.picker-row')];
        expect(rows).toHaveLength(2);
        // the one the annotation has is disabled
        expect(buttonNamed(rows[1], 'Add roof/b.jpg').getAttribute('aria-disabled')).toBe('true');
        buttonNamed(rows[0], 'Add roof/a.jpg').click();
        expect(lastModel()).toEqual([photo('roof/b.jpg'), photo('roof/a.jpg')]);
    });

    it('says when there are no images, and when the search fails', async () => {
        let fail = false;
        const search = vi.fn(async () => { if (fail) throw new Error('boom'); return []; });
        await show({ dataset: makeDataset({ search }) });
        buttonNamed(document.body, 'Pick from the dataset').click();
        await flushPromises();
        expect(document.body.textContent).toContain('No images found');
        fail = true;
        document.querySelector('.picker-search').dispatchEvent(new Event('submit'));
        await flushPromises();
        expect(document.querySelector('.dataset-image-picker [role="alert"]').textContent).toContain('boom');
    });
});

describe('uploading', () => {
    async function choose(files) {
        const input = document.querySelector('input[type="file"]');
        Object.defineProperty(input, 'files', { value: files, configurable: true });
        input.dispatchEvent(new Event('change'));
        await flushPromises();
    }
    const image = name => new File(['x'], name, { type: 'image/jpeg' });

    it('writes each image next to the measurement file as <id>-<n>.<ext> and adds it with the source upload', async () => {
        const dataset = makeDataset();
        await show({ dataset, modelValue: [photo('site/annotations/item-1-1.jpg', { source: 'upload' })] });
        await choose([image('IMG_1.JPG'), image('IMG_2.png')]);
        expect(dataset.writeObj.mock.calls.map(c => c[0])).toEqual(['site/annotations/item-1-2.jpg', 'site/annotations/item-1-3.png']);
        expect(lastModel().map(p => [p.path, p.source])).toEqual([
            ['site/annotations/item-1-1.jpg', 'upload'], ['site/annotations/item-1-2.jpg', 'upload'], ['site/annotations/item-1-3.png', 'upload']
        ]);
        expect(wrapper.emitted('written').map(e => e[0])).toEqual(['site/annotations/item-1-2.jpg', 'site/annotations/item-1-3.png']);
    });

    it('shows the server\'s message and changes nothing when the write fails', async () => {
        const dataset = makeDataset({ writeObj: vi.fn(async () => { throw new Error('Quota exceeded'); }) });
        await show({ dataset });
        await choose([image('IMG_1.JPG')]);
        expect(document.querySelector('[role="alert"]').textContent).toContain('Quota exceeded');
        expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    });

    it('refuses what is not an image, without writing', async () => {
        const dataset = makeDataset();
        await show({ dataset });
        await choose([image('notes.pdf')]);
        expect(dataset.writeObj).not.toHaveBeenCalled();
        expect(document.querySelector('[role="alert"]').textContent).toMatch(/JPEG, PNG, WebP or GIF/);
    });

    it('stops at the limit of 12 photos', async () => {
        const dataset = makeDataset();
        const eleven = Array.from({ length: 11 }, (_, i) => photo(`p${i}.jpg`));
        await show({ dataset, modelValue: eleven });
        await choose([image('a.jpg'), image('b.jpg')]);
        expect(dataset.writeObj).toHaveBeenCalledTimes(1);
        expect(lastModel()).toHaveLength(12);
        expect(document.querySelector('[role="alert"]').textContent).toMatch(/at most 12/);
    });

    it('needs the annotation to have an id and a measurement file', async () => {
        const dataset = makeDataset();
        await show({ dataset, itemId: '' });
        await choose([image('a.jpg')]);
        expect(dataset.writeObj).not.toHaveBeenCalled();
        expect(document.querySelector('[role="alert"]').textContent).toMatch(/saved before/);
    });

    it('can be started from the keyboard: the upload action is a button', async () => {
        await show();
        const upload = buttonNamed(document.body, 'Upload photos');
        expect(upload.tagName).toBe('BUTTON');
        expect(upload.getAttribute('aria-disabled')).toBeNull();
    });
});
