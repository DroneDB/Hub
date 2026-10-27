import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

const h = vi.hoisted(() => ({ store: null, auth: null, reg: { notificationStatus: null } }));
vi.mock('@/stores/preferences', async () => {
    const { reactive } = await import('vue');
    h.store = reactive({ status: 'idle', resetSection: vi.fn(), resetAll: vi.fn() });
    return { usePreferencesStore: () => h.store };
});
vi.mock('@/stores/auth', async () => {
    const { reactive } = await import('vue');
    h.auth = reactive({ flags: { emailEnabled: true }, feature(name) { return this.flags[name]; } });
    return { useAuthStore: () => h.auth };
});
vi.mock('@/libs/api/sharedRegistry', () => ({ default: h.reg }));

const { default: PreferencesDialog } = await import('./PreferencesDialog.vue');
const { PREF, getPref, setPref, applyAccountValue, _resetPrefListenersForTests } = await import('@/libs/preferences');

// The window is teleported to the body: everything is looked up there
let wrapper;
const dom = () => new DOMWrapper(document.body);
async function render(props = {}) {
    wrapper = mount(PreferencesDialog, { props, attachTo: document.body, global: { plugins: [PrimeVue] } });
    await flushPromises();
}
const buttonWith = (text, root = dom()) => root.findAll('button').find(b => b.text().includes(text));
const tabs = () => dom().findAll('[role="tab"]');
const confirmWindow = () => document.body.querySelector('#confirmDialog');

beforeEach(() => {
    _resetPrefListenersForTests();
    setPref(PREF.MEASURE_UNIT, null);
    setPref(PREF.CUSTOM_BASEMAP, null);
    setPref(PREF.BUILD_NOTIFICATIONS, null);
    h.auth.flags.emailEnabled = true;
    h.reg.notificationStatus = vi.fn(() => Promise.resolve({ canReceiveEmail: true, reason: null }));
    h.store.status = 'idle';
    h.store.resetSection.mockReset();
    h.store.resetAll.mockReset();
});
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
    _resetPrefListenersForTests();
});

describe('PreferencesDialog', () => {
    it('is a modal window titled Preferences with one tab per area and the sync status', async () => {
        await render();
        expect(document.body.querySelector('#preferencesDialog')).not.toBeNull();
        expect(document.body.querySelector('.p-dialog-mask')).not.toBeNull();
        expect(dom().find('.p-dialog-title').text()).toBe('Preferences');
        expect(tabs().map(t => t.text())).toEqual(['Units', 'Map', 'Files', 'Lists', 'Viewers', 'Notifications']);
        expect(dom().find('.sync-status').text()).toContain('Saved to your account');
        h.store.status = 'error';
        await flushPromises();
        expect(dom().find('.sync-status').text()).toContain('Not saved');
    });

    it('Reset section asks the store to reset the sections of the tab', async () => {
        await render();
        await buttonWith('Reset section').trigger('click');
        expect(h.store.resetSection).toHaveBeenCalledWith('units');
    });

    it('a Lists tab resets both of its sections', async () => {
        await render();
        await tabs()[3].trigger('click');
        await flushPromises();
        // Panels are in tab order: units, map, files, lists, ... (hidden ones may stay in the DOM)
        const resets = dom().findAll('button').filter(b => b.text().includes('Reset section'));
        await resets[resets.length >= 5 ? 3 : 1].trigger('click');
        expect(h.store.resetSection.mock.calls.map(c => c[0])).toEqual(['datasets', 'orgs']);
    });

    it('follows an account change without writing it back as a local value', async () => {
        await render();
        applyAccountValue(PREF.MEASURE_UNIT, 'imperial');
        await flushPromises();
        expect(document.body.textContent).toContain('Imperial');
        expect(getPref(PREF.MEASURE_UNIT, '')).toBe('imperial');
    });

    it('shows the stored custom basemap as text and clears it', async () => {
        setPref(PREF.CUSTOM_BASEMAP, { sourceType: 'xyz', url: 'https://tiles.example.com/{z}/{x}/{y}.png', attribution: '<b>x</b>' });
        await render();
        await tabs()[1].trigger('click');
        await flushPromises();
        expect(document.body.textContent).toContain('https://tiles.example.com/{z}/{x}/{y}.png');
        expect(document.body.innerHTML).not.toContain('<b>x</b>');
        await buttonWith('Clear').trigger('click');
        expect(getPref(PREF.CUSTOM_BASEMAP, null)).toBeNull();
        expect(document.body.textContent).toContain('No custom basemap is set');
    });

    it('an invalid stored custom basemap is not shown (javascript: URL)', async () => {
        setPref(PREF.CUSTOM_BASEMAP, { sourceType: 'xyz', url: 'javascript:alert(1)' });
        await render();
        await tabs()[1].trigger('click');
        await flushPromises();
        expect(document.body.textContent).not.toContain('javascript:');
        expect(document.body.textContent).toContain('No custom basemap is set');
    });

    it('Close emits close', async () => {
        await render();
        expect(wrapper.emitted('close')).toBeUndefined();
        await buttonWith('Close').trigger('click');
        expect(wrapper.emitted('close')).toHaveLength(1);
    });

    describe('Notifications', () => {
        const select = () => document.getElementById('pref-build-notifications');
        const selectRoot = () => select()?.closest('.p-select');
        const hint = () => document.getElementById('pref-build-notifications-hint');
        const activeTab = () => dom().find('[role="tab"][aria-selected="true"]').text();

        it('has no tab on a server that sends no e-mail, and asks nothing', async () => {
            h.auth.flags.emailEnabled = false;
            await render({ initialTab: 'notifications' });
            expect(tabs().map(t => t.text())).not.toContain('Notifications');
            expect(activeTab()).toBe('Units');
            expect(h.reg.notificationStatus).not.toHaveBeenCalled();
        });

        it('asks for the e-mail status only when the tab is shown', async () => {
            await render();
            expect(h.reg.notificationStatus).not.toHaveBeenCalled();
            await tabs()[5].trigger('click');
            await flushPromises();
            expect(h.reg.notificationStatus).toHaveBeenCalledTimes(1);
        });

        it('opens on the tab given by initialTab, with None, All and Only failed builds, None first', async () => {
            await render({ initialTab: 'notifications' });
            expect(activeTab()).toBe('Notifications');
            expect(document.body.textContent).toContain('Send build notifications');
            expect(selectRoot().classList.contains('p-disabled')).toBe(false);
            expect(selectRoot().textContent).toContain('None');
            const options = wrapper.findAllComponents({ name: 'Select' }).at(-1).props('options');
            expect(options).toEqual([
                { value: 'none', label: 'None' }, { value: 'all', label: 'All' }, { value: 'failed', label: 'Only failed builds' }
            ]);
        });

        it('stores the choice as the build notifications preference', async () => {
            await render({ initialTab: 'notifications' });
            await wrapper.findAllComponents({ name: 'Select' }).at(-1).vm.$emit('update:modelValue', 'failed');
            await flushPromises();
            expect(getPref(PREF.BUILD_NOTIFICATIONS, '')).toBe('failed');
        });

        it('is disabled, with the reason, for an account without an e-mail address', async () => {
            h.reg.notificationStatus = vi.fn(() => Promise.resolve({ canReceiveEmail: false, reason: 'noAddress' }));
            await render({ initialTab: 'notifications' });
            expect(selectRoot().classList.contains('p-disabled')).toBe(true);
            expect(hint().textContent).toBe('Your account has no e-mail address. Ask an administrator to add one.');
            expect(select().getAttribute('aria-describedby')).toBe('pref-build-notifications-hint');
        });

        it('hides the tab when the server says it sends no e-mail', async () => {
            h.reg.notificationStatus = vi.fn(() => Promise.resolve({ canReceiveEmail: false, reason: 'emailDisabled' }));
            await render({ initialTab: 'notifications' });
            expect(tabs().map(t => t.text())).not.toContain('Notifications');
            expect(activeTab()).toBe('Units');
        });

        it('stays usable when the status cannot be read', async () => {
            vi.spyOn(console, 'warn').mockImplementation(() => {});
            h.reg.notificationStatus = vi.fn(() => Promise.reject(new Error('offline')));
            await render({ initialTab: 'notifications' });
            expect(selectRoot().classList.contains('p-disabled')).toBe(false);
        });

        it('shows the tab asked for once the feature flags arrive', async () => {
            h.auth.flags.emailEnabled = false;
            await render({ initialTab: 'notifications' });
            expect(activeTab()).toBe('Units');
            h.auth.flags.emailEnabled = true;
            await flushPromises();
            expect(activeTab()).toBe('Notifications');
        });

        it('Reset section resets the notifications section', async () => {
            await render({ initialTab: 'notifications' });
            const resets = dom().findAll('button').filter(b => b.text().includes('Reset section'));
            await resets.at(-1).trigger('click');
            expect(h.store.resetSection).toHaveBeenCalledWith('notifications');
        });
    });

    describe('Reset all', () => {
        async function askToResetAll() {
            await render();
            await buttonWith('Reset all').trigger('click');
            await flushPromises();
        }

        it('asks for confirmation first, in a window above the preferences', async () => {
            await askToResetAll();
            expect(confirmWindow()).not.toBeNull();
            expect(h.store.resetAll).not.toHaveBeenCalled();
            expect(document.body.querySelector('#preferencesDialog')).not.toBeNull();
            const masks = [...document.body.querySelectorAll('.p-dialog-mask')];
            expect(masks).toHaveLength(2);
            // Later in the DOM: the confirm covers the window (the z-order is checked in the browser)
            expect(masks[1].contains(confirmWindow())).toBe(true);
        });

        it('resets everything when confirmed', async () => {
            await askToResetAll();
            await buttonWith('Reset all', new DOMWrapper(confirmWindow())).trigger('click');
            await flushPromises();
            expect(h.store.resetAll).toHaveBeenCalledTimes(1);
            expect(confirmWindow()).toBeNull();
        });

        it('resets nothing when cancelled', async () => {
            await askToResetAll();
            await buttonWith('Cancel', new DOMWrapper(confirmWindow())).trigger('click');
            await flushPromises();
            expect(h.store.resetAll).not.toHaveBeenCalled();
            expect(confirmWindow()).toBeNull();
            expect(document.body.querySelector('#preferencesDialog')).not.toBeNull();
        });
    });
});
