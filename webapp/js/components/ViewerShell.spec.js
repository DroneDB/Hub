/**
 * ViewerShell, the frame of every viewer (FR-VWR-07, FR-ACC-18, FR-VWR-23, FR-VWR-11): the view bar
 * with the way back to the dataset and the file name (none when embedded), the page state of a
 * file that did not load, from its `load-error`, the navigation toolbar (Home, fullscreen, help)
 * and the docked settings panel.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import PrimeVue from 'primevue/config';
import { b64encode } from '@/libs/base64';
import { ApiError, InvalidLinkError } from '@/libs/ddb/apiError';
import ViewerShell from './ViewerShell.vue';

const Page = { render: () => null };
let wrapper;

async function render(props = {}, { path = `/r/acme/site/view/${b64encode('odm/report/README.md')}/markdown`, embed = false, slots } = {}) {
    globalThis.HubOptions = {};
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: '/r', name: 'Organizations', component: Page },
            { path: '/r/:org/:ds', name: 'ViewDataset', component: Page },
            { path: '/r/:org/:ds/view/:encodedPath/markdown', name: 'Markdown', component: Page },
            { path: '/r/:org/:ds/views/:uid', name: 'SavedView', component: Page },
            { path: '/login', name: 'Login', component: Page }
        ]
    });
    await router.push(path);
    wrapper = mount(ViewerShell, {
        props,
        slots: { default: '<div class="viewer-content" />', ...slots },
        global: { plugins: [router, PrimeVue], provide: { embed } }
    });
    await flushPromises();
}
const bar = () => wrapper.find('.viewer-bar');
const backHref = () => bar().find('a.viewer-back').attributes('href');

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    delete HTMLElement.prototype.requestFullScreen;
    delete document.exitFullscreen;
    delete document.fullscreenElement;
    document.body.innerHTML = '';
});

describe('ViewerShell view bar', () => {
    it('shows the file name and a way back to the dataset', async () => {
        await render();
        expect(bar().find('.viewer-name').text()).toBe('README.md');
        expect(bar().find('a.viewer-back').attributes('aria-label')).toBe('Back to the dataset');
        expect(backHref()).toBe('/r/acme/site');
    });

    it('shows the name it is given, and the viewer content of its bar slot', async () => {
        await render({ name: 'Ortho over DSM' }, { path: '/r/acme/site/views/v_1' });
        expect(bar().find('.viewer-name').text()).toBe('Ortho over DSM');
        wrapper.unmount();
        await render({}, { slots: { bar: '<span class="own">Mine</span>' } });
        expect(bar().find('.own').text()).toBe('Mine');
        expect(bar().find('.viewer-name').exists()).toBe(false);
        expect(backHref()).toBe('/r/acme/site');
    });

    it('has no bar when embedded', async () => {
        await render({}, { embed: true });
        expect(bar().exists()).toBe(false);
    });
});

describe('ViewerShell page states', () => {
    it('a 403 shows the no access state of the dataset, with the way back, in place of the viewer and its spinner', async () => {
        await render({ loadError: new ApiError('Forbidden', 403), error: 'Forbidden', loading: false });
        expect(wrapper.find('h1').text()).toBe('You do not have access to this dataset');
        expect(wrapper.text()).toContain('"site" is private.');
        const first = wrapper.find('.resource-state a');
        expect(first.text()).toBe('Back to the dataset');
        expect(first.attributes('href')).toBe('/r/acme/site');
        expect(wrapper.find('.viewer-content').exists()).toBe(false);
        expect(wrapper.find('.viewer-loading').exists()).toBe(false);
        expect(wrapper.text()).not.toContain('Forbidden');
    });

    it('embedded: no bar, and the way back opens the dataset in a new tab, not in the frame', async () => {
        await render({ loadError: new ApiError('Forbidden', 403) }, { embed: true });
        expect(bar().exists()).toBe(false);
        const back = wrapper.find('.resource-state a');
        expect(back.attributes('href')).toBe('/r/acme/site');
        expect(back.attributes('target')).toBe('_blank');
        wrapper.unmount();
        await render({ loadError: new Error('Broken'), error: 'Broken' }, { embed: true });
        expect(wrapper.find('.viewer-failed a').attributes('target')).toBe('_blank');
    });

    it('a missing file shows the not found state naming its path', async () => {
        await render({ loadError: new ApiError('Cannot find: odm/report/README.md.', 404) });
        expect(wrapper.find('h1').text()).toBe('File not found');
        expect(wrapper.text()).toContain('"odm/report/README.md" does not exist.');
    });

    it('a link whose path cannot be read says the link is not valid (FR-VWR-23)', async () => {
        await render({ loadError: new InvalidLinkError('x') }, { path: '/r/acme/site/view/%25%25%25garbage/markdown' });
        expect(wrapper.find('h1').text()).toBe('This link is not valid');
        expect(wrapper.text()).toContain('The file path in the address cannot be read.');
        expect(wrapper.find('.resource-state a').attributes('href')).toBe('/r/acme/site');
        expect(bar().find('.viewer-name').text()).toBe('');
    });

    it('any other failure to load shows its message and the way back (FR-VWR-05)', async () => {
        await render({ loadError: new Error('cog.tif cannot be opened as markdown'), error: 'cog.tif cannot be opened as markdown' });
        expect(wrapper.find('.resource-state').exists()).toBe(false);
        expect(wrapper.text()).toContain('cog.tif cannot be opened as markdown');
        const back = wrapper.find('.viewer-failed a');
        expect(back.text()).toContain('Back to the dataset');
        expect(back.attributes('href')).toBe('/r/acme/site');
    });

    it('an error of a viewer that loaded shows the message only', async () => {
        await render({ error: 'Save failed' });
        expect(wrapper.text()).toContain('Save failed');
        expect(wrapper.find('.viewer-failed').exists()).toBe(false);
        expect(wrapper.find('.viewer-content').exists()).toBe(true);
    });
});

const GESTURES = [
    { input: 'Left drag', action: 'Rotate' },
    { input: 'Wheel', action: 'Zoom' }
];
/** A key pressed on `target` (the page by default), as the browser sends it to the window */
function press(key, { target = document.body, ...init } = {}) {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
}
const nav = () => wrapper.find('.viewer-nav');
const navButton = label => nav().find(`button[aria-label="${label}"]`);

describe('ViewerShell navigation toolbar (FR-VWR-11)', () => {
    it('has no toolbar unless the viewer asks for it, and none before the viewer is ready', async () => {
        await render({ ready: true });
        expect(nav().exists()).toBe(false);
        wrapper.unmount();
        await render({ navToolbar: true, ready: false });
        expect(nav().exists()).toBe(false);
        wrapper.unmount();
        await render({ navToolbar: true, ready: true });
        expect(nav().exists()).toBe(true);
        expect(navButton('Home').exists()).toBe(true);
        expect(navButton('Controls').attributes('aria-expanded')).toBe('false');
    });

    it('Home button emits home', async () => {
        await render({ navToolbar: true, ready: true });
        await navButton('Home').trigger('click');
        expect(wrapper.emitted('home')).toHaveLength(1);
    });

    it('the keys Home, H and 0 emit home, whatever has the focus but a field, and keep their modified forms', async () => {
        await render({ navToolbar: true, ready: true });
        for (const key of ['Home', 'h', 'H', '0']) {
            const event = press(key);
            expect(event.defaultPrevented, key).toBe(true);
        }
        expect(wrapper.emitted('home')).toHaveLength(4);

        press('h', { ctrlKey: true });
        press('0', { metaKey: true });
        press('x');
        expect(wrapper.emitted('home')).toHaveLength(4);
    });

    it('ignores the keys while typing in a field', async () => {
        await render({ navToolbar: true, ready: true });
        for (const tag of ['input', 'textarea', 'select']) {
            const field = document.createElement(tag);
            document.body.append(field);
            expect(press('h', { target: field }).defaultPrevented, tag).toBe(false);
            expect(press('Home', { target: field }).defaultPrevented, tag).toBe(false);
        }
        const editable = document.createElement('div');
        editable.contentEditable = 'true';
        // happy-dom does not derive isContentEditable from the attribute
        Object.defineProperty(editable, 'isContentEditable', { value: true });
        document.body.append(editable);
        expect(press('0', { target: editable }).defaultPrevented).toBe(false);
        expect(wrapper.emitted('home')).toBeUndefined();
    });

    it('does not take the keys without the toolbar, before the viewer is ready, or after it is gone', async () => {
        await render({ ready: true });
        press('Home');
        wrapper.unmount();
        await render({ navToolbar: true, ready: false });
        press('Home');
        expect(wrapper.emitted('home')).toBeUndefined();
        const gone = wrapper;
        await render({ navToolbar: true, ready: true });
        gone.unmount();
        press('Home');
        expect(wrapper.emitted('home')).toHaveLength(1);
    });

    it('the help lists the gestures of the viewer and the Home keys, and closes on Escape', async () => {
        await render({ navToolbar: true, ready: true, gestures: GESTURES });
        expect(wrapper.find('.viewer-help').exists()).toBe(false);
        await navButton('Controls').trigger('click');
        const help = wrapper.find('.viewer-help');
        expect(navButton('Controls').attributes('aria-expanded')).toBe('true');
        expect(help.attributes('role')).toBe('dialog');
        expect(help.findAll('dt').map(d => d.text())).toEqual(['Left drag', 'Wheel', 'Home, H or 0']);
        expect(help.findAll('dd').map(d => d.text())).toEqual(['Rotate', 'Zoom', 'Back to the framed view']);

        press('Escape');
        await flushPromises();
        expect(wrapper.find('.viewer-help').exists()).toBe(false);
    });

    it('the help closes on a click away from it', async () => {
        await render({ navToolbar: true, ready: true, gestures: GESTURES });
        await navButton('Controls').trigger('click');
        document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        await flushPromises();
        expect(wrapper.find('.viewer-help').exists()).toBe(false);
    });

    it('fullscreen asks the shell element for it, and leaves it again', async () => {
        const request = vi.fn();
        const exit = vi.fn();
        // supportsFullScreen asks the body; the request goes to the element
        HTMLElement.prototype.requestFullScreen = request;
        document.exitFullscreen = exit;
        await render({ navToolbar: true, ready: true });
        const button = navButton('Fullscreen');
        expect(button.attributes('aria-pressed')).toBe('false');
        await button.trigger('click');
        expect(request).toHaveBeenCalledTimes(1);
        expect(request.mock.contexts[0]).toBe(wrapper.element);

        Object.defineProperty(document, 'fullscreenElement', { value: wrapper.element, configurable: true });
        document.dispatchEvent(new Event('fullscreenchange'));
        await flushPromises();
        expect(navButton('Exit fullscreen').attributes('aria-pressed')).toBe('true');
        await navButton('Exit fullscreen').trigger('click');
        expect(exit).toHaveBeenCalledTimes(1);
    });

    it('has no fullscreen button where the browser cannot', async () => {
        await render({ navToolbar: true, ready: true });
        expect(navButton('Fullscreen').exists()).toBe(false);
        expect(navButton('Home').exists()).toBe(true);
    });

    it('stands in the corner the settings button leaves free, and holds what the viewer adds', async () => {
        await render({ navToolbar: true, ready: true, settingsButton: 'bottom-left' }, { slots: { nav: '<button class="own">Mine</button>' } });
        expect(nav().classes()).toContain('bottom-right');
        expect(nav().find('.own').exists()).toBe(true);
        wrapper.unmount();
        await render({ navToolbar: true, ready: true, settingsButton: 'bottom-right' });
        expect(nav().classes()).toContain('bottom-left');
    });
});

describe('ViewerShell settings panel (FR-VWR-11)', () => {
    const settingsSlot = { settings: '<input class="field" type="range"><button class="inside">Reset</button>' };
    const panel = () => wrapper.find('.viewer-settings-panel');

    it('opens docked on the side of its button, not modal, with the settings in it', async () => {
        await render({ ready: true, settingsButton: 'bottom-left', settingsTitle: 'Lighting', settingsId: 'model-lighting' }, { slots: settingsSlot });
        expect(panel().exists()).toBe(false);
        await wrapper.find('.btn-settings').trigger('click');
        expect(panel().exists()).toBe(true);
        expect(panel().attributes('id')).toBe('model-lighting');
        expect(panel().attributes('aria-modal')).toBe('false');
        expect(panel().attributes('aria-label')).toBe('Lighting');
        expect(panel().classes()).toEqual(expect.arrayContaining(['side-left', 'from-bottom']));
        expect(panel().find('.field').exists()).toBe(true);
        expect(wrapper.find('.btn-settings').attributes('aria-expanded')).toBe('true');
        // Inside the viewer area, not a window over the page
        expect(wrapper.find('.container-wrapper').element.contains(panel().element)).toBe(true);
        expect(wrapper.find('.p-dialog').exists()).toBe(false);
        expect(wrapper.find('.p-dialog-mask').exists()).toBe(false);
    });

    it('docks on the right for a right button, and on the default side at the top without a button', async () => {
        await render({ ready: true, settingsButton: 'bottom-right', settingsOpen: true }, { slots: settingsSlot });
        expect(panel().classes()).toEqual(expect.arrayContaining(['side-right', 'from-bottom']));
        wrapper.unmount();
        await render({ ready: true, settingsOpen: true }, { slots: settingsSlot });
        expect(wrapper.find('.btn-settings').exists()).toBe(false);
        expect(panel().classes()).toEqual(expect.arrayContaining(['side-right', 'from-top']));
    });

    it('closes on Escape, on its close button and on the settings button', async () => {
        await render({ ready: true, settingsButton: 'bottom-left', 'onUpdate:settingsOpen': v => wrapper.setProps({ settingsOpen: v }) }, { slots: settingsSlot });
        await wrapper.setProps({ settingsOpen: true });
        press('Escape');
        await flushPromises();
        expect(panel().exists()).toBe(false);

        await wrapper.setProps({ settingsOpen: true });
        await panel().find('.viewer-panel-close').trigger('click');
        expect(panel().exists()).toBe(false);

        await wrapper.find('.btn-settings').trigger('click');
        expect(panel().exists()).toBe(true);
        await wrapper.find('.btn-settings').trigger('click');
        expect(panel().exists()).toBe(false);
    });

    it('the viewer keeps its own control over the panel through settings-open (the splat viewer has its own button)', async () => {
        await render({ ready: true, settingsOpen: false }, { slots: settingsSlot });
        expect(panel().exists()).toBe(false);
        await wrapper.setProps({ settingsOpen: true });
        expect(panel().exists()).toBe(true);
        await wrapper.setProps({ settingsOpen: false });
        expect(panel().exists()).toBe(false);
    });
});
