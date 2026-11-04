/**
 * The Copy link panel of the map viewer: the address of the saved view, or of the file of a new
 * view, and nothing else of the page; the note to save what the link does not show, with the
 * Save for writers; optionally "viewer only", and who can open it. It closes with Esc and with a
 * press outside it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import ddb from 'ddb';
import { b64encode } from '@/libs/base64';
import { VIEWER_ONLY_HELP } from '@/libs/views/viewLinks';
import Keyboard from '@/libs/keyboard';

const clipboard = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock('clipboard-copy', () => ({ default: clipboard }));

const { default: MapLinkPanel } = await import('./MapLinkPanel.vue');

const PATH = 'flights/ortho.tif';
const FILE = { path: PATH };
const prefix = () => `${window.location.origin}/r/acme/site/view/${b64encode(PATH)}/map`;
const savedPrefix = () => `${window.location.origin}/r/acme/site/views/v_k3j9x2ab`;

let wrapper;
async function open({ visibility = ddb.Visibility.PUBLIC, linkTarget = FILE, ...rest } = {}) {
    const dataset = { org: 'acme', ds: 'site', getVisibility: vi.fn(() => Promise.resolve(visibility)) };
    wrapper = mount(MapLinkPanel, { props: { dataset, linkTarget, ...rest }, attachTo: document.body });
    await flushPromises();
}
const url = () => wrapper.find('[data-testid="map-link-url"]').element.value;
const viewerOnlyBox = () => wrapper.find('[data-testid="map-link-viewer-only"]');

beforeEach(() => clipboard.mockClear());
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.replaceChildren();
    window.history.replaceState({}, '', '/');
});

describe('MapLinkPanel', () => {
    it('is the address of the saved view, and nothing else', async () => {
        await open({ linkTarget: { uid: 'v_k3j9x2ab' } });
        expect(url()).toBe(savedPrefix());
    });

    it('is the address of the file of a new view, with no layers', async () => {
        await open();
        expect(url()).toBe(prefix());
    });

    it('takes nothing from the address of the page: no hash, no other keys', async () => {
        window.history.replaceState({}, '', '/r/acme/site/view/x/map?title=Hi&c=1&embed=1&add=zzz#map=12/1/2');
        await open();
        expect(url()).toBe(prefix());
        expect(url()).not.toMatch(/title|#|embed|zzz/);
    });

    it('follows the target when the view is saved', async () => {
        await open();
        await wrapper.setProps({ linkTarget: { uid: 'v_k3j9x2ab' } });
        expect(url()).toBe(savedPrefix());
    });

    it('opens with viewer only off, and adds embed=1 exactly once when it is on', async () => {
        await open({ linkTarget: { uid: 'v_k3j9x2ab' } });
        expect(viewerOnlyBox().element.checked).toBe(false);
        expect(url()).not.toContain('embed');
        await viewerOnlyBox().setValue(true);
        expect(url()).toBe(`${savedPrefix()}?embed=1`);
        expect(url().match(/embed=1/g)).toHaveLength(1);
        await viewerOnlyBox().setValue(false);
        expect(url()).not.toContain('embed');
    });

    it('is off again when the panel is opened again', async () => {
        await open();
        await viewerOnlyBox().setValue(true);
        wrapper.unmount();
        await open();
        expect(viewerOnlyBox().element.checked).toBe(false);
    });

    it('explains the option, and never says that it restricts access', async () => {
        await open();
        expect(wrapper.find('[data-testid="map-link-viewer-only-help"]').text()).toBe(VIEWER_ONLY_HELP);
        expect(wrapper.text()).not.toMatch(/restrict|secure|protect|private link/i);
    });

    it('says who can open the link only for a Private dataset', async () => {
        await open({ visibility: ddb.Visibility.PRIVATE });
        expect(wrapper.find('[data-testid="map-link-private-note"]').text())
            .toBe('Only people with access to this dataset can open this link.');
        wrapper.unmount();
        for (const visibility of [ddb.Visibility.PUBLIC, ddb.Visibility.UNLISTED]) {
            await open({ visibility });
            expect(wrapper.find('[data-testid="map-link-private-note"]').exists()).toBe(false);
            wrapper.unmount();
        }
        wrapper = null;
    });

    it('puts embed=1 on the link of a file too', async () => {
        await open();
        await viewerOnlyBox().setValue(true);
        expect(url()).toBe(`${prefix()}?embed=1`);
    });

    describe('the note to save', () => {
        const note = () => wrapper.find('[data-testid="map-link-note"]');
        const save = () => wrapper.find('[data-testid="map-link-save"]');

        it('is not shown while the link opens what the map shows', async () => {
            await open({ linkTarget: { uid: 'v_k3j9x2ab' }, canSave: true });
            expect(note().exists()).toBe(false);
            expect(save().exists()).toBe(false);
        });

        it('says to save the view, to everyone, with the link of the saved version', async () => {
            await open({ linkTarget: { uid: 'v_k3j9x2ab' }, note: true });
            expect(note().text()).toContain('Save the view to share your changes.');
            expect(url()).toBe(savedPrefix());
            expect(save().exists()).toBe(false);
        });

        it('says the same on a new view, with the link of the file', async () => {
            await open({ note: true });
            expect(note().text()).toContain('Save the view to share your changes.');
            expect(url()).toBe(prefix());
        });

        it('offers Save to a user who can save, and asks the viewer to save it', async () => {
            await open({ note: true, canSave: true });
            expect(save().text()).toBe('Save');
            await save().trigger('click');
            expect(wrapper.emitted('save')).toHaveLength(1);
            expect(wrapper.emitted('close')).toBeUndefined();
        });

        it('goes with the note: a user who can save has no Save when the note is off', async () => {
            await open({ note: true, canSave: true });
            await wrapper.setProps({ note: false });
            expect(save().exists()).toBe(false);
        });
    });

    it('copies the link as shown and shows that it was copied', async () => {
        await open({ linkTarget: { uid: 'v_k3j9x2ab' } });
        await viewerOnlyBox().setValue(true);
        const copy = wrapper.find('[data-testid="map-link-copy"]');
        expect(copy.attributes('aria-label')).toBe('Copy to clipboard');
        expect(copy.find('i').classes()).toContain('fa-copy');
        await copy.trigger('click');
        await flushPromises();
        expect(clipboard).toHaveBeenCalledWith(url());
        expect(copy.find('i').classes()).toContain('fa-check');
    });

    it('names its controls and closes', async () => {
        await open();
        expect(wrapper.find('input[type="text"]').attributes('id')).toBe(wrapper.find('label.section-label').attributes('for'));
        expect(wrapper.find('.close-btn').attributes('aria-label')).toBe('Close');
        await wrapper.find('.close-btn').trigger('click');
        expect(wrapper.emitted('close')).toHaveLength(1);
    });

    describe('closing', () => {
        const press = element => element.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        /** An element of the page outside the panel */
        const outside = (html = '<div></div>') => {
            const host = document.createElement('div');
            host.innerHTML = html;
            document.body.appendChild(host);
            return host.firstElementChild;
        };

        it('closes with Esc, and not with another key', async () => {
            await open();
            window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter' }));
            expect(wrapper.emitted('close')).toBeUndefined();
            window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape' }));
            expect(wrapper.emitted('close')).toHaveLength(1);
        });

        it('closes with a press outside it, and not with one inside it', async () => {
            await open();
            press(wrapper.find('[data-testid="map-link-url"]').element);
            press(viewerOnlyBox().element);
            expect(wrapper.emitted('close')).toBeUndefined();
            press(outside());
            expect(wrapper.emitted('close')).toHaveLength(1);
        });

        it('leaves a press on the button that opens and closes it to that button', async () => {
            await open({ toggle: '[data-map-link-toggle]' });
            const button = outside('<button data-map-link-toggle><i class="fa-solid fa-link"></i></button>');
            press(button.querySelector('i'));
            press(button);
            expect(wrapper.emitted('close')).toBeUndefined();
            press(outside());
            expect(wrapper.emitted('close')).toHaveLength(1);
        });

        it('stops listening for Esc once it is closed', async () => {
            const on = vi.spyOn(Keyboard, 'onKeyUp');
            const off = vi.spyOn(Keyboard, 'offKeyUp');
            await open();
            wrapper.unmount();
            wrapper = null;
            expect(on).toHaveBeenCalledTimes(1);
            expect(off).toHaveBeenCalledWith(on.mock.calls[0][0]);
            on.mockRestore();
            off.mockRestore();
        });
    });
});
