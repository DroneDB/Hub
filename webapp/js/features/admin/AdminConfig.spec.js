import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

const h = vi.hoisted(() => ({
    sys: { config: null },
    copyText: null
}));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: { sys: h.sys } }));
vi.mock('@/composables/useCopyText', () => ({ copyText: text => h.copyText(text) }));
// The page's leave guard, kept to be called as the router would
const guards = vi.hoisted(() => ({ leave: null, update: null }));
vi.mock('vue-router', async importOriginal => ({
    ...(await importOriginal()),
    onBeforeRouteLeave: fn => { guards.leave = fn; },
    onBeforeRouteUpdate: fn => { guards.update = fn; },
    useRouter: () => undefined
}));

const { ref } = await import('vue');
const { default: Select } = await import('primevue/select');
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
let notify;
async function show(stubs = { UsageAndContactCard: true, EmailTemplatesCard: true }) {
    h.sys.config = vi.fn(() => Promise.resolve(structuredClone(CONFIG)));
    notify = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
    wrapper = mount(AdminConfig, {
        attachTo: document.body,
        global: {
            plugins: [PrimeVue],
            stubs,
            mocks: { $notify: notify, $router: { push: vi.fn() } }
        }
    });
    await flushPromises();
    return wrapper;
}
const fieldOf = key => [...document.querySelectorAll('.config-field')].find(f => f.querySelector('label')?.textContent === key);
// A card that exposes a dirty state, as the real ones do
const dirtyCard = (name, dirty) => ({ name, template: '<div />', setup(_, { expose }) { expose({ dirty }); } });
const question = () => document.body.querySelector('#confirmDialog');
async function answer(label) {
    [...question().querySelectorAll('button')].find(b => b.textContent.trim() === label).click();
    await flushPromises();
}
const editEmailSetting = async value => {
    await wrapper.findComponent(Select).vm.$emit('update:modelValue', value);
    await flushPromises();
};
const tasks = { path: '/admin/tasks', fullPath: '/admin/tasks' };
const here = { path: '/admin/config', fullPath: '/admin/config' };

beforeEach(() => {
    h.copyText = vi.fn(() => Promise.resolve());
});
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
});

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

    it('says that it does not change the server, and how to use what it copies (D-005)', async () => {
        await show();
        expect(wrapper.text()).toContain('This page does not change the server. Merge the copied keys into appsettings.json, then restart the Registry. Do not replace the file with them.');
    });

    describe('edits', () => {
        it('shows the edit count in a bar, and Discard edits drops them', async () => {
            await show();
            expect(wrapper.find('.edits-bar').exists()).toBe(false);
            await editEmailSetting('off');
            expect(wrapper.find('.edits-bar').text()).toContain('1 edit');

            await wrapper.find('.edits-bar button[aria-label="Discard edits"]').trigger('click');
            await flushPromises();
            expect(wrapper.find('.edits-bar').exists()).toBe(false);
            expect(notify.info).toHaveBeenCalledWith(expect.any(String), { summary: 'Edits discarded' });
            expect(await guards.leave(tasks, here)).toBe(true);
            expect(question()).toBeNull();
        });

        it('leaving with modified fields asks once; Cancel keeps the value', async () => {
            await show();
            await editEmailSetting('off');
            const first = guards.leave(tasks, here);
            const second = guards.leave({ path: '/admin/users', fullPath: '/admin/users' }, here);
            await flushPromises();
            expect(document.body.querySelectorAll('#confirmDialog')).toHaveLength(1);

            await answer('Cancel');
            expect(await first).toBe(false);
            expect(await second).toBe(false);
            expect(wrapper.findComponent(Select).props('modelValue')).toBe('off');
            expect(wrapper.find('.edits-bar').text()).toContain('1 edit');
        });

        it('Discard in the question leaves', async () => {
            await show();
            await editEmailSetting('off');
            const leaving = guards.leave(tasks, here);
            await flushPromises();
            await answer('Discard');
            expect(await leaving).toBe(true);
        });

        it('asks nothing when nothing is edited, or for the Preferences query on this page', async () => {
            await show();
            expect(await guards.leave(tasks, here)).toBe(true);
            await editEmailSetting('off');
            expect(await guards.update({ ...here, query: { preferences: 'general' } }, here)).toBe(true);
            expect(question()).toBeNull();
        });
    });

    describe('the cards', () => {
        it('a router push while only the e-mail template card is dirty asks once; Cancel keeps the edit', async () => {
            const cardDirty = ref(true);
            await show({ UsageAndContactCard: true, EmailTemplatesCard: dirtyCard('EmailTemplatesCard', cardDirty) });
            expect(wrapper.find('.edits-bar').exists()).toBe(false);
            const leaving = guards.leave(tasks, here);
            const again = guards.update({ ...here, path: '/admin/config/other' }, here);
            await flushPromises();
            expect(document.body.querySelectorAll('#confirmDialog')).toHaveLength(1);
            await answer('Cancel');
            expect(await leaving).toBe(false);
            expect(await again).toBe(false);
            expect(cardDirty.value).toBe(true);

            cardDirty.value = false;
            expect(await guards.leave(tasks, here)).toBe(true);
        });

        it('asks while the usage card has a change', async () => {
            await show({ UsageAndContactCard: dirtyCard('UsageAndContactCard', ref(true)), EmailTemplatesCard: true });
            const leaving = guards.leave(tasks, here);
            await flushPromises();
            expect(question()).not.toBeNull();
            await answer('Cancel');
            expect(await leaving).toBe(false);
        });

        it('a page unload shows the browser question once a card is dirty', async () => {
            const cardDirty = ref(false);
            await show({ UsageAndContactCard: true, EmailTemplatesCard: dirtyCard('EmailTemplatesCard', cardDirty) });
            const unload = () => {
                const e = new Event('beforeunload', { cancelable: true });
                window.dispatchEvent(e);
                return e.defaultPrevented;
            };
            expect(unload()).toBe(false);
            cardDirty.value = true;
            await flushPromises();
            expect(unload()).toBe(true);
        });
    });
});
