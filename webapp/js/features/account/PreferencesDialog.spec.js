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
    it('is a modal window titled User preferences with one tab per area and the sync status', async () => {
        await render();
        expect(document.body.querySelector('#preferencesDialog')).not.toBeNull();
        expect(document.body.querySelector('.p-dialog-mask')).not.toBeNull();
        expect(dom().find('.p-dialog-title').text()).toBe('User preferences');
        expect(tabs().map(t => t.text())).toEqual(['Units', 'Map', 'Files', 'Lists', 'Viewers', 'Stockpiles', 'Notifications']);
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

    describe('Map tab', () => {
        const urlInput = () => document.getElementById('pref-custom-basemap-url');
        const open = async () => {
            await render();
            await tabs()[1].trigger('click');
            await flushPromises();
        };
        // The basemap select, as a user's choice
        async function chooseBasemap(value) {
            wrapper.findAllComponents({ name: 'Select' }).find(c => c.props('inputId') === 'pref-basemap').vm.$emit('update:modelValue', value);
            await flushPromises();
        }

        beforeEach(() => {
            setPref(PREF.BASEMAP, null);
            setPref(PREF.LOCATIONS_MAP_NAMES, null);
            vi.spyOn(globalThis, 'Image').mockImplementation(function () {
                const img = {};
                Object.defineProperty(img, 'src', { set(v) { if (v) queueMicrotask(() => img.onload?.()); } });
                return img;
            });
        });
        afterEach(() => vi.restoreAllMocks());

        it('has no custom basemap editor while another basemap is chosen', async () => {
            await open();
            expect(urlInput()).toBeNull();
        });

        it('Custom opens the editor without storing Custom; Apply stores the source and Custom', async () => {
            await open();
            await chooseBasemap('custom');
            expect(getPref(PREF.BASEMAP, 'satellite')).toBe('satellite');
            expect(urlInput()).not.toBeNull();
            await new DOMWrapper(urlInput()).setValue('https://tiles.example.com/{z}/{x}/{y}.png');
            await buttonWith('Apply').trigger('click');
            await flushPromises();
            expect(getPref(PREF.CUSTOM_BASEMAP, null)).toMatchObject({ sourceType: 'xyz', url: 'https://tiles.example.com/{z}/{x}/{y}.png' });
            expect(getPref(PREF.BASEMAP, '')).toBe('custom');
        });

        it('shows the stored custom source in the editor and Clear returns to the default basemap', async () => {
            setPref(PREF.BASEMAP, 'custom');
            setPref(PREF.CUSTOM_BASEMAP, { sourceType: 'xyz', url: 'https://tiles.example.com/{z}/{x}/{y}.png' });
            await open();
            expect(urlInput().value).toBe('https://tiles.example.com/{z}/{x}/{y}.png');
            await buttonWith('Clear').trigger('click');
            await flushPromises();
            expect(getPref(PREF.CUSTOM_BASEMAP, null)).toBeNull();
            expect(getPref(PREF.BASEMAP, '')).toBe('satellite');
            expect(urlInput()).toBeNull();
        });

        it('an invalid stored custom source (javascript: URL) is not shown', async () => {
            setPref(PREF.BASEMAP, 'custom');
            setPref(PREF.CUSTOM_BASEMAP, { sourceType: 'xyz', url: 'javascript:alert(1)' });
            await open();
            expect(urlInput().value).toBe('');
            expect(document.body.textContent).not.toContain('javascript:');
        });

        it('the dataset names of the datasets map are a toggle of the account', async () => {
            await open();
            const toggle = document.getElementById('pref-dataset-names');
            expect(toggle.checked).toBe(false);
            toggle.click();
            await flushPromises();
            expect(getPref(PREF.LOCATIONS_MAP_NAMES, false)).toBe(true);
        });
    });

    describe('Gaussian splat quality', () => {
        const quality = () => document.getElementById('pref-splat-quality');
        const open = async () => {
            await render();
            await tabs()[4].trigger('click');
            await flushPromises();
        };

        beforeEach(() => setPref(PREF.SPLAT_QUALITY, null));

        it('is a select in the Viewers tab with auto, low, medium and high, automatic by default', async () => {
            await open();
            expect(quality()).not.toBeNull();
            expect(quality().closest('.p-select').textContent).toContain('Auto');
            quality().closest('.p-select').click();
            await flushPromises();
            expect(Array.from(document.body.querySelectorAll('[role="option"]')).map(o => o.textContent.trim())).toEqual(['Auto', 'Low', 'Medium', 'High']);
        });

        it('shows what is stored, and the default for a value that is not a quality', async () => {
            setPref(PREF.SPLAT_QUALITY, 'medium');
            await open();
            expect(quality().closest('.p-select').textContent).toContain('Medium');
            wrapper.unmount();
            setPref(PREF.SPLAT_QUALITY, 'turbo');
            await open();
            expect(quality().closest('.p-select').textContent).toContain('Auto');
        });

        it('follows a change that comes from the account', async () => {
            await open();
            applyAccountValue(PREF.SPLAT_QUALITY, 'low');
            await flushPromises();
            expect(quality().closest('.p-select').textContent).toContain('Low');
        });
    });

    describe('Organization sort', () => {
        const column = () => document.getElementById('pref-orgs-sort-column');
        const direction = () => document.getElementById('pref-orgs-sort-direction');
        const open = async () => {
            await render();
            await tabs()[3].trigger('click');
            await flushPromises();
        };
        beforeEach(() => setPref(PREF.ORG_PAGE, null));

        it('is a sort field and an order in the Lists tab, by name ascending by default', async () => {
            await open();
            expect(column().closest('.p-select').textContent).toContain('Name');
            expect(direction().closest('.p-select').textContent).toContain('Ascending');
            column().closest('.p-select').click();
            await flushPromises();
            expect(Array.from(document.body.querySelectorAll('[role="option"]')).map(o => o.textContent.trim()))
                .toEqual(['Name', 'Creation date', 'Last modified', 'Number of datasets']);
        });

        it('shows what is stored, and the default for a value the list does not know', async () => {
            setPref(PREF.ORG_PAGE, { sortColumn: 'lastModified', sortDirection: 'desc' });
            await open();
            expect(column().closest('.p-select').textContent).toContain('Last modified');
            expect(direction().closest('.p-select').textContent).toContain('Descending');
            wrapper.unmount();
            setPref(PREF.ORG_PAGE, { sortColumn: 'size', sortDirection: 'sideways' });
            await open();
            expect(column().closest('.p-select').textContent).toContain('Name');
            expect(direction().closest('.p-select').textContent).toContain('Ascending');
        });

        it('follows a change that comes from the account', async () => {
            await open();
            applyAccountValue(PREF.ORG_PAGE, { itemsPerPage: 10, ownedOnly: true, sortColumn: 'datasetCount', sortDirection: 'desc' });
            await flushPromises();
            expect(column().closest('.p-select').textContent).toContain('Number of datasets');
            expect(direction().closest('.p-select').textContent).toContain('Descending');
        });
    });

    describe('Currency', () => {
        const currency = () => document.getElementById('pref-currency');
        beforeEach(() => setPref(PREF.CURRENCY, null));

        it('is a general setting on the Units tab, US dollars by default', async () => {
            await render();
            expect(currency().closest('.p-select').textContent).toContain('USD');
            expect(document.body.textContent).toContain('Changing it does not convert them');
        });

        it('stores the choice as the currency preference, not with the stockpile materials', async () => {
            setPref(PREF.STOCKPILE_MATERIALS, { overrides: { gravel: { costPerTon: 9 } }, custom: [] });
            await render();
            const select = wrapper.findAllComponents({ name: 'Select' }).find(c => c.props('inputId') === 'pref-currency');
            select.vm.$emit('update:modelValue', 'EUR');
            await flushPromises();
            expect(getPref(PREF.CURRENCY, null)).toBe('EUR');
            expect(getPref(PREF.STOCKPILE_MATERIALS, null)).toEqual({ overrides: { gravel: { costPerTon: 9 } }, custom: [] });
        });

        it('shows the default for a stored value that is not a currency code', async () => {
            setPref(PREF.CURRENCY, 'euros');
            await render();
            expect(currency().closest('.p-select').textContent).toContain('USD');
        });
    });

    describe('Stockpiles', () => {
        beforeEach(() => setPref(PREF.STOCKPILE_MATERIALS, null));

        it('has the materials, and no currency of its own', async () => {
            await render({ initialTab: 'stockpiles' });
            expect(document.body.querySelector('[data-testid="stockpile-materials-editor"]')).not.toBeNull();
            expect(document.getElementById('pref-stockpile-currency')).toBeNull();
        });

        it('Reset section resets the stockpiles section', async () => {
            await render({ initialTab: 'stockpiles' });
            const panel = dom().findAll('[role="tabpanel"]').find(p => p.find('[data-testid="stockpile-materials-editor"]').exists());
            await buttonWith('Reset section', panel).trigger('click');
            expect(h.store.resetSection).toHaveBeenCalledWith('stockpiles');
        });
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
            await tabs().find(t => t.text() === 'Notifications').trigger('click');
            await flushPromises();
            expect(h.reg.notificationStatus).toHaveBeenCalledTimes(1);
        });

        it('brings the tab given by initialTab into view (the tab list scrolls when the tabs do not fit)', async () => {
            const scrolled = [];
            const original = HTMLElement.prototype.scrollIntoView;
            HTMLElement.prototype.scrollIntoView = function () { scrolled.push(this.textContent.trim()); };
            try {
                await render({ initialTab: 'notifications' });
                await flushPromises();
                expect(scrolled).toContain('Notifications');
            } finally {
                HTMLElement.prototype.scrollIntoView = original;
            }
        });

        it('opens on the tab given by initialTab, with None, All and Failed or waiting for files, None first', async () => {
            await render({ initialTab: 'notifications' });
            expect(activeTab()).toBe('Notifications');
            expect(document.body.textContent).toContain('Send build notifications');
            expect(selectRoot().classList.contains('p-disabled')).toBe(false);
            expect(selectRoot().textContent).toContain('None');
            const options = wrapper.findAllComponents({ name: 'Select' }).at(-1).props('options');
            expect(options).toEqual([
                { value: 'none', label: 'None' }, { value: 'all', label: 'All' }, { value: 'failed', label: 'Failed or waiting for files' }
            ]);
            expect(hint().textContent).toContain('once when a build waits for files to be uploaded');
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
