import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

const h = vi.hoisted(() => ({
    sys: { config: null },
    copyText: null
}));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: { sys: h.sys } }));
vi.mock('@/composables/useCopyText', () => ({ copyText: text => h.copyText(text) }));

const { default: AdminConfig } = await import('./AdminConfig.vue');

const field = (key, fieldType, currentValue, defaultValue = currentValue) => ({
    key, displayName: key, fieldType, currentValue, defaultValue, description: `${key} help`,
    isSet: false, sensitive: false, enumOptions: fieldType === 'enum' ? ['security', 'all', 'off'] : null
});
const CONFIG = {
    sections: [{
        name: 'UpdateCheck',
        title: 'Update check',
        description: 'Update check: disabled (AppSettings:UpdateCheckCron). Docs: https://docs.dronedb.app/docs/self-hosting/update-check',
        isActive: false,
        fields: [
            field('UpdateCheckEmail', 'enum', 'all', 'security'),
            field('InstanceId', 'info', '0f8fad5b-d9cb-469f-a165-70867728950e')
        ]
    }]
};

let wrapper;
async function show() {
    h.sys.config = vi.fn(() => Promise.resolve(structuredClone(CONFIG)));
    wrapper = mount(AdminConfig, {
        attachTo: document.body,
        global: {
            plugins: [PrimeVue],
            stubs: { UsageAndContactCard: true, EmailTemplatesCard: true },
            mocks: { $notify: { success: vi.fn(), error: vi.fn(), info: vi.fn() }, $router: { push: vi.fn() } }
        }
    });
    await flushPromises();
    return wrapper;
}
const fieldOf = key => [...document.querySelectorAll('.config-field')].find(f => f.querySelector('label')?.textContent === key);

beforeEach(() => {
    h.copyText = vi.fn(() => Promise.resolve());
});
afterEach(() => wrapper?.unmount());

describe('AdminConfig', () => {
    it('has the usage and the e-mail templates cards (each decides whether it shows)', async () => {
        await show();
        expect(wrapper.findComponent({ name: 'UsageAndContactCard' }).exists()).toBe(true);
        expect(wrapper.findComponent({ name: 'EmailTemplatesCard' }).exists()).toBe(true);
    });

    it('mounts the cards once, after the configuration is loaded (each card loads its own data on mount)', async () => {
        let mounts = 0;
        const Card = { name: 'EmailTemplatesCard', template: '<div />', mounted: () => { mounts++; } };
        let resolveConfig;
        h.sys.config = vi.fn(() => new Promise(resolve => { resolveConfig = resolve; }));
        wrapper = mount(AdminConfig, {
            attachTo: document.body,
            global: {
                plugins: [PrimeVue],
                stubs: { UsageAndContactCard: true, EmailTemplatesCard: Card },
                mocks: { $notify: { success: vi.fn(), error: vi.fn(), info: vi.fn() }, $router: { push: vi.fn() } }
            }
        });
        await flushPromises();
        expect(mounts).toBe(0);

        resolveConfig(structuredClone(CONFIG));
        await flushPromises();
        expect(mounts).toBe(1);
    });

    it('shows an informational value read-only, not as a setting', async () => {
        await show();
        const info = fieldOf('InstanceId');
        const input = info.querySelector('input');
        expect(input.value).toBe('0f8fad5b-d9cb-469f-a165-70867728950e');
        expect(input.readOnly).toBe(true);
        expect(info.textContent).toContain('Read-only');
        expect(info.textContent).not.toContain('Default');
    });

    it('leaves informational values out of the AppSettings JSON, and writes the keys where Registry reads them', async () => {
        await show();
        [...document.querySelectorAll('button')].find(b => b.textContent.includes('Copy AppSettings JSON')).click();
        await flushPromises();

        expect(h.copyText).toHaveBeenCalledTimes(1);
        // UpdateCheckEmail is a direct key of AppSettings: the section only groups it on the page
        expect(JSON.parse(h.copyText.mock.calls[0][0])).toEqual({ AppSettings: { UpdateCheckEmail: 'all' } });
    });

    it('names each section header by its title, described by its Custom/Default tag', async () => {
        await show();
        const header = document.querySelector('button[aria-label="Update check"]');
        expect(header).not.toBeNull();
        expect(document.getElementById(header.getAttribute('aria-describedby')).textContent).toBe('Default');
    });
});
