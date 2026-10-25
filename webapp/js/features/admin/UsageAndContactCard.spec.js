import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import Select from 'primevue/select';

const h = vi.hoisted(() => ({
    sys: { updateInfo: null, saveUpdateCheckSettings: null },
    auth: null,
    notify: { success: vi.fn(), error: vi.fn() }
}));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: { sys: h.sys } }));
vi.mock('@/libs/notify', () => ({ notify: h.notify }));
vi.mock('@/stores/auth', async () => {
    const { reactive } = await import('vue');
    h.auth = reactive({
        isLoggedIn: true,
        isAdmin: true,
        flags: { updateCheckEnabled: true },
        feature(name) { return this.flags[name]; }
    });
    return { useAuthStore: () => h.auth };
});

const { default: UsageAndContactCard } = await import('./UsageAndContactCard.vue');
const { resetUpdateCheck } = await import('@/composables/useUpdateCheck');

const INFO = {
    currentVersion: '2.0.0',
    latestVersion: null,
    isUpdateAvailable: false,
    useDeclaration: null,
    contactEmail: null,
    licenseRequestUrl: 'https://dronedb.app/request-license?instance=abc'
};

let wrapper;
async function show(info = {}) {
    h.sys.updateInfo = vi.fn(() => Promise.resolve({ ...INFO, ...info }));
    wrapper = mount(UsageAndContactCard, { attachTo: document.body, global: { plugins: [PrimeVue] } });
    await flushPromises();
    return wrapper;
}
const saveButton = () => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Save'));
const emailInput = () => document.getElementById('usage-contact-email');
const consentBox = () => document.getElementById('usage-contact-consent');
const licenceLink = () => [...document.querySelectorAll('a')].find(a => a.textContent.includes('Get a licence'));
async function typeEmail(value) {
    emailInput().value = value;
    emailInput().dispatchEvent(new Event('input'));
    await flushPromises();
}

beforeEach(() => {
    resetUpdateCheck();
    h.auth.flags.updateCheckEnabled = true;
    h.notify.success.mockClear();
    h.notify.error.mockClear();
    h.sys.saveUpdateCheckSettings = vi.fn(body => Promise.resolve({ ...INFO, useDeclaration: body.useDeclaration, contactEmail: body.contactEmail }));
});
afterEach(() => wrapper?.unmount());

describe('UsageAndContactCard', () => {
    it('offers the six declarations and the help text', async () => {
        const w = await show();
        const labels = w.findComponent(Select).props('options').map(o => o.label);
        expect(labels).toEqual(['Not stated', 'Personal or homelab use', 'Non-profit organisation', 'Evaluation or trial',
            'Commercial use, licensed', 'Commercial use, I need a licence']);
        expect(w.text()).toContain('This helps us understand how Registry is used. It changes nothing in the software.');
    });

    it('fills the form with the saved values', async () => {
        const w = await show({ useDeclaration: 'nonprofit', contactEmail: 'it@acme.test' });
        expect(w.findComponent(Select).props('modelValue')).toBe('nonprofit');
        expect(emailInput().value).toBe('it@acme.test');
        expect(consentBox().checked).toBe(true);
    });

    it('saves a declaration without an address', async () => {
        const w = await show();
        await w.findComponent(Select).vm.$emit('update:modelValue', 'personal');
        expect(saveButton().disabled).toBe(false);
        saveButton().click();
        await flushPromises();
        expect(h.sys.saveUpdateCheckSettings).toHaveBeenCalledWith({ useDeclaration: 'personal', contactEmail: null, contactConsent: false });
        expect(h.notify.success).toHaveBeenCalled();
    });

    it('sends "not stated" as null', async () => {
        const w = await show({ useDeclaration: 'personal' });
        await w.findComponent(Select).vm.$emit('update:modelValue', 'not_stated');
        saveButton().click();
        await flushPromises();
        expect(h.sys.saveUpdateCheckSettings).toHaveBeenCalledWith(expect.objectContaining({ useDeclaration: null }));
    });

    it('cannot save an address until the consent box is ticked', async () => {
        await show();
        expect(consentBox().disabled).toBe(true);
        await typeEmail('it@acme.test');
        expect(consentBox().disabled).toBe(false);
        expect(saveButton().disabled).toBe(true);

        consentBox().click();
        await flushPromises();
        expect(saveButton().disabled).toBe(false);
        saveButton().click();
        await flushPromises();
        expect(h.sys.saveUpdateCheckSettings).toHaveBeenCalledWith({ useDeclaration: null, contactEmail: 'it@acme.test', contactConsent: true });
    });

    it('asks for the consent again when another address replaces the saved one', async () => {
        await show({ contactEmail: 'it@acme.test' });
        expect(consentBox().checked).toBe(true);

        await typeEmail(' it@acme.test ');
        expect(consentBox().checked).toBe(true);

        await typeEmail('ops@acme.test');
        expect(consentBox().checked).toBe(false);
        expect(saveButton().disabled).toBe(true);

        consentBox().click();
        await flushPromises();
        saveButton().click();
        await flushPromises();
        expect(h.sys.saveUpdateCheckSettings).toHaveBeenCalledWith({ useDeclaration: null, contactEmail: 'ops@acme.test', contactConsent: true });
    });

    it('keeps the form and Save disabled until the saved values have arrived', async () => {
        let answer;
        h.sys.updateInfo = vi.fn(() => new Promise(resolve => { answer = resolve; }));
        wrapper = mount(UsageAndContactCard, { attachTo: document.body, global: { plugins: [PrimeVue] } });
        await flushPromises();

        expect(wrapper.findComponent(Select).props('disabled')).toBe(true);
        expect(emailInput().disabled).toBe(true);
        expect(saveButton().disabled).toBe(true);

        answer({ ...INFO, useDeclaration: 'personal', contactEmail: 'it@acme.test' });
        await flushPromises();
        expect(wrapper.findComponent(Select).props('disabled')).toBe(false);
        expect(emailInput().disabled).toBe(false);
        expect(emailInput().value).toBe('it@acme.test');
        expect(saveButton().disabled).toBe(false);
    });

    it('cannot save when the saved values could not be loaded', async () => {
        h.sys.updateInfo = vi.fn(() => Promise.reject(new Error('offline')));
        wrapper = mount(UsageAndContactCard, { attachTo: document.body, global: { plugins: [PrimeVue] } });
        await flushPromises();

        expect(wrapper.text()).toContain('could not be loaded');
        expect(emailInput().disabled).toBe(true);
        expect(saveButton().disabled).toBe(true);
    });

    it('sends no address and no consent once the address is cleared', async () => {
        await show({ contactEmail: 'it@acme.test' });
        await typeEmail('');
        expect(consentBox().checked).toBe(false);
        saveButton().click();
        await flushPromises();
        expect(h.sys.saveUpdateCheckSettings).toHaveBeenCalledWith({ useDeclaration: null, contactEmail: null, contactConsent: false });
    });

    it('shows the server error and stays editable when a save is refused', async () => {
        await show();
        h.sys.saveUpdateCheckSettings = vi.fn(() => Promise.reject(new Error('refused')));
        await typeEmail('it@acme.test');
        consentBox().click();
        await flushPromises();
        saveButton().click();
        await flushPromises();
        expect(h.notify.error).toHaveBeenCalledWith(expect.objectContaining({ message: 'refused' }));
        expect(saveButton().disabled).toBe(false);
    });

    it('links to the licence request unless the deployment is licensed', async () => {
        await show();
        expect(licenceLink().getAttribute('href')).toBe(INFO.licenseRequestUrl);
        expect(licenceLink().getAttribute('target')).toBe('_blank');
        wrapper.unmount();
        resetUpdateCheck();
        await show({ useDeclaration: 'commercial_licensed' });
        expect(licenceLink()).toBeUndefined();
    });

    it('explains and disables the inputs when the update check is off, keeping the licence link', async () => {
        h.auth.flags.updateCheckEnabled = false;
        const w = await show();
        expect(w.text()).toContain('update check is turned off');
        expect(emailInput().disabled).toBe(true);
        expect(saveButton().disabled).toBe(true);
        expect(licenceLink()).toBeDefined();
        expect(h.sys.updateInfo).toHaveBeenCalledTimes(1);
    });
});
