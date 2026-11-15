/**
 * The confirmation to remove a user from an organization names both as text: an organization
 * name is chosen by its owner, and the message is HTML.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

const reg = vi.hoisted(() => ({ admin: {}, orgs: {} }));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: reg }));

const { default: OrganizationsDialog } = await import('./OrganizationsDialog.vue');

const MARKUP = '<img src=x onerror=alert(1)>';
let wrapper;
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
});

describe('OrganizationsDialog remove confirmation', () => {
    it('shows the user and the organization named like markup as text, with no element made of them', async () => {
        reg.admin.getUserOrganizations = vi.fn(() => Promise.resolve([{ slug: 'acme', name: MARKUP, permissions: 1, grantedAt: '2026-01-02T00:00:00Z' }]));
        reg.orgs.getOrganizations = vi.fn(() => Promise.resolve([]));
        wrapper = mount(OrganizationsDialog, { props: { user: { userName: '<b>alice</b>' } }, attachTo: document.body, global: { plugins: [PrimeVue] } });
        await flushPromises();

        wrapper.vm.confirmRemoveOrganization({ slug: 'acme', name: MARKUP });
        await flushPromises();

        const message = document.getElementById('confirmDialog');
        expect(message.querySelector('img')).toBeNull();
        expect(message.textContent).toContain(`remove <b>alice</b> from organization ${MARKUP}?`);
    });
});
