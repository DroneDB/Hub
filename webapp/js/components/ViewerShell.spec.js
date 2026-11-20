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

describe('ViewerShell fullscreen (FR-VWR-38)', () => {
    const request = vi.fn();
    const exit = vi.fn();
    const supportFullscreen = () => {
        request.mockClear();
        exit.mockClear();
        // supportsFullScreen asks the body; the request goes to the element
        HTMLElement.prototype.requestFullScreen = request;
        document.exitFullscreen = exit;
    };
    const barButton = () => wrapper.find('.viewer-bar .viewer-fullscreen');
    const setFullscreenElement = async element => {
        Object.defineProperty(document, 'fullscreenElement', { value: element, configurable: true });
        document.dispatchEvent(new Event('fullscreenchange'));
        await flushPromises();
    };

    it('a viewer without the toolbar has the button in its view bar, which asks the root of the shell for fullscreen', async () => {
        supportFullscreen();
        await render({ fullscreenButton: true });
        expect(nav().exists()).toBe(false);
        expect(barButton().attributes('aria-label')).toBe('Fullscreen');
        expect(barButton().attributes('title')).toBe('Fullscreen (F)');
        await barButton().trigger('click');
        expect(request).toHaveBeenCalledTimes(1);
        expect(request.mock.contexts[0]).toBe(wrapper.element);
        expect(wrapper.element.classList.contains('viewer-shell')).toBe(true);
    });

    it('shows the way out and the compress icon while the browser is in fullscreen, and leaves it again', async () => {
        supportFullscreen();
        await render({ fullscreenButton: true });
        expect(barButton().find('i').classes()).toContain('fa-expand');
        await setFullscreenElement(wrapper.element);
        expect(barButton().attributes('aria-label')).toBe('Exit fullscreen');
        expect(barButton().attributes('aria-pressed')).toBe('true');
        expect(barButton().find('i').classes()).toContain('fa-compress');
        await barButton().trigger('click');
        expect(exit).toHaveBeenCalledTimes(1);
        await setFullscreenElement(null);
        expect(barButton().attributes('aria-label')).toBe('Fullscreen');
    });

    it('has no button of the bar unless the viewer asks, where the browser cannot, or when the toolbar has it', async () => {
        supportFullscreen();
        await render({});
        expect(barButton().exists()).toBe(false);
        wrapper.unmount();
        delete HTMLElement.prototype.requestFullScreen;
        await render({ fullscreenButton: true });
        expect(barButton().exists()).toBe(false);
    });

    it('the key F toggles fullscreen of the shell, with the toolbar or with the button of the bar', async () => {
        supportFullscreen();
        await render({ navToolbar: true, ready: true });
        expect(press('f').defaultPrevented).toBe(true);
        expect(press('F').defaultPrevented).toBe(true);
        expect(request).toHaveBeenCalledTimes(2);
        expect(request.mock.contexts[0]).toBe(wrapper.element);
        wrapper.unmount();
        request.mockClear();
        await render({ fullscreenButton: true });
        press('f');
        expect(request).toHaveBeenCalledTimes(1);
        expect(nav().exists()).toBe(false);
    });

    it('the key F leaves fullscreen when the browser is in it', async () => {
        supportFullscreen();
        await render({ fullscreenButton: true });
        await setFullscreenElement(wrapper.element);
        press('f');
        expect(exit).toHaveBeenCalledTimes(1);
        expect(request).not.toHaveBeenCalled();
    });

    it('the key F is not taken while typing, with a modifier (Ctrl+F finds), on a held key, before ready or without the button', async () => {
        supportFullscreen();
        await render({ navToolbar: true, ready: true });
        for (const tag of ['input', 'textarea', 'select']) {
            const field = document.createElement(tag);
            document.body.append(field);
            expect(press('f', { target: field }).defaultPrevented, tag).toBe(false);
        }
        expect(press('f', { ctrlKey: true }).defaultPrevented).toBe(false);
        expect(press('f', { metaKey: true }).defaultPrevented).toBe(false);
        expect(press('f', { altKey: true }).defaultPrevented).toBe(false);
        expect(press('f', { repeat: true }).defaultPrevented).toBe(true);
        expect(request).not.toHaveBeenCalled();
        wrapper.unmount();
        await render({ navToolbar: true, ready: false });
        press('f');
        wrapper.unmount();
        await render({ ready: true });
        press('f');
        expect(request).not.toHaveBeenCalled();
    });

    it('does not take the key F where the browser has no fullscreen, or after the shell is gone', async () => {
        await render({ fullscreenButton: true });
        expect(press('f').defaultPrevented).toBe(false);
        wrapper.unmount();
        supportFullscreen();
        await render({ fullscreenButton: true });
        const gone = wrapper;
        await render({ fullscreenButton: true });
        gone.unmount();
        press('f');
        expect(request).toHaveBeenCalledTimes(1);
    });
});

describe('ViewerShell fullscreen when embedded (FR-VWR-38)', () => {
    const request = vi.fn();
    const exit = vi.fn();
    const supportFullscreen = () => {
        request.mockClear();
        exit.mockClear();
        HTMLElement.prototype.requestFullScreen = request;
        document.exitFullscreen = exit;
    };
    const overlay = () => wrapper.find('.container-wrapper > button.viewer-fullscreen-overlay');

    it('has no view bar, and the same button stands over the view, where it toggles fullscreen of the shell', async () => {
        supportFullscreen();
        await render({ fullscreenButton: true }, { embed: true });
        expect(bar().exists()).toBe(false);
        expect(wrapper.findAll('button.viewer-fullscreen')).toHaveLength(0);
        expect(overlay().exists()).toBe(true);
        expect(overlay().attributes('aria-label')).toBe('Fullscreen');
        expect(overlay().attributes('title')).toBe('Fullscreen (F)');
        expect(overlay().attributes('aria-pressed')).toBe('false');
        expect(overlay().find('i').classes()).toContain('fa-expand');
        await overlay().trigger('click');
        expect(request).toHaveBeenCalledTimes(1);
        expect(request.mock.contexts[0]).toBe(wrapper.element);

        Object.defineProperty(document, 'fullscreenElement', { value: wrapper.element, configurable: true });
        document.dispatchEvent(new Event('fullscreenchange'));
        await flushPromises();
        expect(overlay().attributes('aria-label')).toBe('Exit fullscreen');
        expect(overlay().attributes('aria-pressed')).toBe('true');
        expect(overlay().find('i').classes()).toContain('fa-compress');
        await overlay().trigger('click');
        expect(exit).toHaveBeenCalledTimes(1);
    });

    it('stands in the top right corner by default, or in the corner the viewer names, and marks the shell', async () => {
        supportFullscreen();
        await render({ fullscreenButton: true }, { embed: true });
        expect(overlay().classes()).toContain('top-right');
        expect(wrapper.element.classList.contains('has-fullscreen-overlay')).toBe(true);
        wrapper.unmount();
        await render({ fullscreenButton: true, fullscreenCorner: 'bottom-right' }, { embed: true });
        expect(overlay().classes()).toContain('bottom-right');
        expect(overlay().classes()).not.toContain('top-right');
    });

    it('the key F toggles it embedded too', async () => {
        supportFullscreen();
        await render({ fullscreenButton: true }, { embed: true });
        expect(press('f').defaultPrevented).toBe(true);
        expect(request).toHaveBeenCalledTimes(1);
    });

    it('is not over the view of a page that is not embedded, of a viewer that did not ask, or where the browser cannot', async () => {
        supportFullscreen();
        await render({ fullscreenButton: true });
        expect(overlay().exists()).toBe(false);
        expect(wrapper.element.classList.contains('has-fullscreen-overlay')).toBe(false);
        wrapper.unmount();
        await render({}, { embed: true });
        expect(overlay().exists()).toBe(false);
        wrapper.unmount();
        delete HTMLElement.prototype.requestFullScreen;
        await render({ fullscreenButton: true }, { embed: true });
        expect(overlay().exists()).toBe(false);
    });
});

describe('ViewerShell key F and the keys of others (FR-VWR-38)', () => {
    const request = vi.fn();
    const supportFullscreen = () => {
        request.mockClear();
        HTMLElement.prototype.requestFullScreen = request;
    };

    it('leaves F to the viewer when its fullscreen-key returns false (fly mode flies down on F), and asks it on every press', async () => {
        supportFullscreen();
        let flying = true;
        const fullscreenKey = vi.fn(() => !flying);
        await render({ fullscreenButton: true, fullscreenKey });
        const first = press('f');
        expect(first.defaultPrevented).toBe(false);
        expect(fullscreenKey).toHaveBeenCalledTimes(1);
        expect(fullscreenKey.mock.calls[0][0]).toBe(first);
        expect(request).not.toHaveBeenCalled();
        flying = false;
        expect(press('F').defaultPrevented).toBe(true);
        expect(request).toHaveBeenCalledTimes(1);
    });

    it('takes F when fullscreen-key returns anything but false', async () => {
        supportFullscreen();
        await render({ navToolbar: true, ready: true, fullscreenKey: () => undefined });
        press('f');
        expect(request).toHaveBeenCalledTimes(1);
    });

    it('does not take F that a handler before it has taken', async () => {
        supportFullscreen();
        await render({ fullscreenButton: true });
        const canvas = document.createElement('div');
        document.body.append(canvas);
        canvas.addEventListener('keydown', e => e.preventDefault());
        press('f', { target: canvas });
        expect(request).not.toHaveBeenCalled();
    });

    it('does not take F while a modal dialog or a PrimeVue dialog has the focus, and takes it in a non-modal popup', async () => {
        supportFullscreen();
        await render({ fullscreenButton: true });
        const modal = document.createElement('div');
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.innerHTML = '<button type="button">OK</button>';
        const primeDialog = document.createElement('div');
        primeDialog.className = 'p-dialog';
        primeDialog.innerHTML = '<button type="button">Go to</button>';
        const popup = document.createElement('div');
        popup.setAttribute('role', 'dialog');
        popup.setAttribute('aria-modal', 'false');
        popup.innerHTML = '<button type="button">Help</button>';
        document.body.append(modal, primeDialog, popup);
        expect(press('f', { target: modal.querySelector('button') }).defaultPrevented).toBe(false);
        expect(press('f', { target: modal }).defaultPrevented).toBe(false);
        expect(press('f', { target: primeDialog.querySelector('button') }).defaultPrevented).toBe(false);
        expect(request).not.toHaveBeenCalled();
        expect(press('f', { target: popup.querySelector('button') }).defaultPrevented).toBe(true);
        expect(request).toHaveBeenCalledTimes(1);
    });
});
