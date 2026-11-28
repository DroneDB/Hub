/**
 * The README panel of the dataset page: the handle above it sets the height of the README (pointer, touch, keyboard),
 * kept on this device, inside the share of the tab the files above it leave; a double click gives back the default.
 * Whether the panel is open is kept on this device as well: a panel the user folded is folded when it is shown again.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import DatasetReadme from './DatasetReadme.vue';
import { PREF, getPref, removePref, setPref } from '@/libs/preferences';
import { writePanelSize } from '@/libs/panelSize';

const KEY = 'datasetReadme.px';
const offsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
const clientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
const dataset = { getFileContents: async () => '# Test data\n\nText.', downloadUrl: p => `/dl/${p}` };

let wrapper;
let tab;

/** Mounts the panel in a tab `tabPx` tall (happy-dom lays nothing out: the heights the panel measures are given) */
async function mountIn(tabPx = 1000, { textPx = 200 } = {}) {
    tab = document.body.appendChild(document.createElement('div'));
    // The element the panel is in is the tab
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
        configurable: true,
        get() { return [...this.children].some(c => c.classList.contains('dataset-readme')) ? tabPx : 0; }
    });
    // The section is its text and 40 px of bar and handle
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
        configurable: true,
        get() {
            if (this.classList.contains('readme-body')) return textPx;
            return this.classList.contains('dataset-readme') ? textPx + 40 : 0;
        }
    });
    wrapper = mount(DatasetReadme, {
        props: { dataset, entry: { path: 'README.md', size: 40 } },
        attachTo: tab,
        global: { plugins: [PrimeVue] }
    });
    await flushPromises();
    wrapper.find('.readme-body').element.getBoundingClientRect = () => ({ height: textPx });
    return wrapper;
}

const gutter = () => wrapper.find('[role="separator"]');
const bodyHeight = () => wrapper.find('.readme-body').element.style.height;
const kept = () => getPref(PREF.PANEL_SIZES, {})?.[KEY];

const toggle = () => wrapper.find('.readme-toggle');
const bodyShown = () => wrapper.find('.readme-body').element.style.display !== 'none';

/** Puts the measured heights of the elements back, and takes the panel and its tab away */
function unmountPanel() {
    wrapper?.unmount();
    tab?.remove();
    if (offsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', offsetHeight);
    if (clientHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientHeight);
}

async function dragBy(dy, pointerId = 1) {
    await gutter().trigger('pointerdown', { button: 0, pointerId, clientY: 500 });
    await gutter().trigger('pointermove', { pointerId, clientY: 500 + dy });
    await gutter().trigger('pointerup', { pointerId, clientY: 500 + dy });
}

describe('DatasetReadme height', () => {
    beforeEach(() => {
        removePref(PREF.PANEL_SIZES);
        removePref(PREF.README_OPEN);
    });
    afterEach(() => {
        unmountPanel();
        removePref(PREF.PANEL_SIZES);
        removePref(PREF.README_OPEN);
    });

    it('is as tall as its content until a height is chosen, with a handle that is a separator', async () => {
        await mountIn();
        expect(wrapper.find('.content').text()).toContain('Test data');
        expect(bodyHeight()).toBe('');
        expect(wrapper.find('.readme-body').classes()).not.toContain('sized');
        const handle = gutter();
        expect(handle.attributes('tabindex')).toBe('0');
        expect(handle.attributes('aria-orientation')).toBe('horizontal');
        expect(handle.attributes('aria-controls')).toBe('dataset-readme-body');
        expect(handle.attributes('aria-label')).toBe('Resize README.md');
    });

    it('grows as the handle is dragged up and shrinks as it is dragged down, and keeps the height when the drag ends', async () => {
        await mountIn();
        await gutter().trigger('pointerdown', { button: 0, pointerId: 1, clientY: 500 });
        await gutter().trigger('pointermove', { pointerId: 1, clientY: 400 });
        expect(bodyHeight()).toBe('300px');
        expect(wrapper.find('.readme-body').classes()).toContain('sized');
        expect(kept()).toBeUndefined(); // kept when the drag ends, not at every move
        await gutter().trigger('pointermove', { pointerId: 1, clientY: 550 });
        expect(bodyHeight()).toBe('150px');
        await gutter().trigger('pointerup', { pointerId: 1, clientY: 550 });
        expect(kept()).toBe(150);
        expect(gutter().attributes('aria-valuenow')).toBe('150');
    });

    it('stays between its smallest height and the share of the tab the files leave', async () => {
        await mountIn(1000);
        // 80 % of the tab less the bar and the handle
        expect(gutter().attributes('aria-valuemax')).toBe('760');
        await dragBy(-2000);
        expect(bodyHeight()).toBe('760px');
        expect(kept()).toBe(760);
        await dragBy(2000);
        expect(bodyHeight()).toBe('48px');
        expect(kept()).toBe(48);
    });

    it('ignores another button and another pointer', async () => {
        await mountIn();
        await gutter().trigger('pointerdown', { button: 2, pointerId: 1, clientY: 500 });
        await gutter().trigger('pointermove', { pointerId: 1, clientY: 300 });
        expect(bodyHeight()).toBe('');
        await gutter().trigger('pointerdown', { button: 0, pointerId: 1, clientY: 500 });
        await gutter().trigger('pointermove', { pointerId: 2, clientY: 300 });
        expect(bodyHeight()).toBe('');
    });

    it('opens at the kept height, shown smaller in a shorter tab without losing it', async () => {
        writePanelSize(KEY, 600);
        await mountIn(500);
        expect(bodyHeight()).toBe('360px');
        expect(kept()).toBe(600);
    });

    it('is moved by the arrow keys (Shift: a fine step), Home and End', async () => {
        await mountIn(1000);
        await gutter().trigger('keydown', { key: 'ArrowUp' });
        expect(bodyHeight()).toBe('232px');
        expect(kept()).toBe(232);
        await gutter().trigger('keydown', { key: 'ArrowDown' });
        await gutter().trigger('keydown', { key: 'ArrowDown' });
        expect(bodyHeight()).toBe('168px');
        await gutter().trigger('keydown', { key: 'ArrowUp', shiftKey: true });
        expect(bodyHeight()).toBe('176px');
        await gutter().trigger('keydown', { key: 'End' });
        expect(bodyHeight()).toBe('760px');
        await gutter().trigger('keydown', { key: 'Home' });
        expect(bodyHeight()).toBe('48px');
        expect(kept()).toBe(48);
        await gutter().trigger('keydown', { key: 'Enter' });
        expect(bodyHeight()).toBe('48px');
    });

    it('goes back to its default height on a double click, and forgets the kept one', async () => {
        writePanelSize('dataset.desktop.px', 320);
        writePanelSize(KEY, 400);
        await mountIn();
        expect(bodyHeight()).toBe('400px');
        await gutter().trigger('dblclick');
        expect(bodyHeight()).toBe('');
        expect(kept()).toBeUndefined();
        expect(getPref(PREF.PANEL_SIZES, {})['dataset.desktop.px']).toBe(320); // the other panes keep theirs
    });

    it('has no handle while it is collapsed', async () => {
        await mountIn();
        await wrapper.find('.readme-toggle').trigger('click');
        expect(gutter().exists()).toBe(false);
        await wrapper.find('.readme-toggle').trigger('click');
        expect(gutter().exists()).toBe(true);
    });
});

describe('DatasetReadme open or folded', () => {
    beforeEach(() => removePref(PREF.README_OPEN));
    afterEach(() => {
        unmountPanel();
        removePref(PREF.README_OPEN);
    });

    it('is open until the user folds it, and nothing is kept before that', async () => {
        await mountIn();
        expect(bodyShown()).toBe(true);
        expect(toggle().attributes('aria-expanded')).toBe('true');
        expect(getPref(PREF.README_OPEN, null)).toBeNull();
    });

    // The page takes the panel away in a folder and shows a new one back at the root, or in another dataset
    it('stays folded when the panel is shown again after the user folded it', async () => {
        await mountIn();
        await toggle().trigger('click');
        expect(bodyShown()).toBe(false);
        expect(getPref(PREF.README_OPEN, null)).toBe(false);
        unmountPanel();

        await mountIn();
        expect(bodyShown()).toBe(false);
        expect(toggle().attributes('aria-expanded')).toBe('false');
        expect(gutter().exists()).toBe(false);
    });

    it('is open again the next time once the user opened it', async () => {
        setPref(PREF.README_OPEN, false);
        await mountIn();
        expect(bodyShown()).toBe(false);
        await toggle().trigger('click');
        expect(bodyShown()).toBe(true);
        expect(wrapper.find('.content').text()).toContain('Test data');
        expect(getPref(PREF.README_OPEN, null)).toBe(true);
        unmountPanel();

        await mountIn();
        expect(bodyShown()).toBe(true);
        expect(gutter().exists()).toBe(true);
    });

    it('follows a change made elsewhere (another tab of the browser)', async () => {
        await mountIn();
        setPref(PREF.README_OPEN, false);
        await flushPromises();
        expect(bodyShown()).toBe(false);
        expect(toggle().attributes('aria-expanded')).toBe('false');
    });
});
