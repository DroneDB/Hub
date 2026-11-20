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
const w_declare = async value => {
    await wrapper.findComponent(Select).vm.$emit('update:modelValue', value);
    await flushPromises();
};
async function show(info = {}) {
    h.sys.updateInfo = vi.fn(() => Promise.resolve({ ...INFO, ...info }));
    wrapper = mount(UsageAndContactCard, { attachTo: document.body, global: { plugins: [PrimeVue] } });
    await flushPromises();
    return wrapper;
}
const saveButton = () => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Save'));
// A disabled Save is aria-disabled, not disabled: it stays focusable and says why (FR-XC-22)
const saveDisabled = () => saveButton().getAttribute('aria-disabled') === 'true';
const saveReason = () => document.getElementById(saveButton().getAttribute('aria-describedby'))?.textContent ?? null;
const emailError = () => document.getElementById('usage-contact-email-error')?.textContent ?? null;
const consentHelp = () => document.getElementById('usage-contact-consent-help')?.textContent ?? null;
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
        expect(labels).toEqual(['Not stated', 'Personal use by an individual', 'Teaching or research at a non-profit institution',
            'Evaluation (up to 60 days)', 'Organisation or paid work, licensed', 'Organisation or paid work, I need a licence']);
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
        expect(saveDisabled()).toBe(false);
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

    it('saves an address only with the consent box ticked: a Save without it shows the error and sends nothing', async () => {
        await show();
        expect(consentBox().disabled).toBe(true);
        expect(consentHelp()).toBeNull();
        await typeEmail('it@acme.test');
        expect(consentBox().disabled).toBe(false);
        // Save stays available (D-046); the helper says what is missing
        expect(saveDisabled()).toBe(false);
        expect(consentHelp()).toBe('Tick the box to save an e-mail address');
        expect(consentBox().getAttribute('aria-invalid')).toBeNull();

        saveButton().click();
        await flushPromises();
        expect(h.sys.saveUpdateCheckSettings).not.toHaveBeenCalled();
        expect(document.getElementById('usage-contact-consent-help').classList.contains('consent-error')).toBe(true);
        expect(consentBox().getAttribute('aria-invalid')).toBe('true');
        expect(document.activeElement).toBe(consentBox());

        consentBox().click();
        await flushPromises();
        expect(consentHelp()).toBeNull();
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
        expect(consentHelp()).toBe('Tick the box to save an e-mail address');

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
        expect(saveDisabled()).toBe(true);
        expect(saveReason()).toBe('The saved settings are loading');

        answer({ ...INFO, useDeclaration: 'personal', contactEmail: 'it@acme.test' });
        await flushPromises();
        expect(wrapper.findComponent(Select).props('disabled')).toBe(false);
        expect(emailInput().disabled).toBe(false);
        expect(emailInput().value).toBe('it@acme.test');
        // Nothing changed yet: still no Save
        expect(saveDisabled()).toBe(true);
        expect(saveReason()).toBe('No changes to save');
    });

    it('cannot save when the saved values could not be loaded', async () => {
        h.sys.updateInfo = vi.fn(() => Promise.reject(new Error('offline')));
        wrapper = mount(UsageAndContactCard, { attachTo: document.body, global: { plugins: [PrimeVue] } });
        await flushPromises();

        expect(wrapper.text()).toContain('could not be loaded');
        expect(emailInput().disabled).toBe(true);
        expect(saveDisabled()).toBe(true);
        expect(saveReason()).toBe('The saved settings could not be loaded');
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
        expect(saveDisabled()).toBe(false);
    });

    it('exposes whether the form differs from the saved values (the page asks before it is left)', async () => {
        const w = await show({ useDeclaration: 'nonprofit', contactEmail: 'it@acme.test' });
        expect(w.vm.dirty).toBe(false);

        await typeEmail(' it@acme.test ');
        expect(w.vm.dirty).toBe(false);
        await typeEmail('ops@acme.test');
        expect(w.vm.dirty).toBe(true);
        await typeEmail('it@acme.test');
        // The consent of the saved address was taken off by the other address
        expect(w.vm.dirty).toBe(true);
        consentBox().click();
        await flushPromises();
        expect(w.vm.dirty).toBe(false);

        await w.findComponent(Select).vm.$emit('update:modelValue', 'personal');
        expect(w.vm.dirty).toBe(true);
        saveButton().click();
        await flushPromises();
        expect(w.vm.dirty).toBe(false);
    });

    it('is not dirty before the saved values have arrived', async () => {
        h.sys.updateInfo = vi.fn(() => new Promise(() => {}));
        wrapper = mount(UsageAndContactCard, { attachTo: document.body, global: { plugins: [PrimeVue] } });
        await flushPromises();
        expect(wrapper.vm.dirty).toBe(false);
    });

    // FR-ADM-21
    it('disables Save with the reason "No changes to save" while the form equals the saved values, and keeps the button focusable', async () => {
        await show({ useDeclaration: 'nonprofit', contactEmail: 'it@acme.test' });
        expect(saveDisabled()).toBe(true);
        expect(saveReason()).toBe('No changes to save');
        expect(saveButton().disabled).toBe(false);
        expect(saveButton().title).toBe('Save: No changes to save');
        saveButton().click();
        await flushPromises();
        expect(h.sys.saveUpdateCheckSettings).not.toHaveBeenCalled();

        await w_declare('personal');
        expect(saveDisabled()).toBe(false);
        expect(saveButton().getAttribute('aria-describedby')).toBeNull();
    });

    it('a Save with an e-mail that is not an address saves nothing and shows the rule at the field', async () => {
        await show();
        await typeEmail('not an email');
        consentBox().click();
        await flushPromises();
        expect(emailError()).toBe('The e-mail address is not valid: enter one address, such as name@example.com');
        expect(emailInput().getAttribute('aria-invalid')).toBe('true');
        expect(emailInput().getAttribute('aria-describedby')).toBe('usage-contact-email-error');
        // Save is available: the card is dirty
        expect(saveDisabled()).toBe(false);

        saveButton().click();
        await flushPromises();
        expect(h.sys.saveUpdateCheckSettings).not.toHaveBeenCalled();
        expect(h.notify.success).not.toHaveBeenCalled();
        expect(document.activeElement).toBe(emailInput());

        await typeEmail('it@acme.test');
        expect(emailError()).toBeNull();
        expect(emailInput().getAttribute('aria-invalid')).toBeNull();
    });

    it('shows no rule for an empty address (it is optional)', async () => {
        await show({ contactEmail: 'it@acme.test' });
        await typeEmail('');
        expect(emailError()).toBeNull();
        expect(consentHelp()).toBeNull();
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
        expect(saveDisabled()).toBe(true);
        expect(saveReason()).toBe('The update check is turned off on this server');
        expect(licenceLink()).toBeDefined();
        expect(h.sys.updateInfo).toHaveBeenCalledTimes(1);
    });
});
