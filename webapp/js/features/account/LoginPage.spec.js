/**
 * LoginPage and the one-shot notice of FR-XC-13: an expired session says why (FR-ACC-09), and
 * the landing after sign-in is the page that asked, or home (FR-NAV-06), without the notice.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';

vi.mock('@/libs/api/sharedRegistry', () => ({
    default: { ensureLoggedIn: () => false, isLoggedIn: () => false, getUsername: () => null, isAdmin: () => false, addEventListener() { } }
}));

const { default: LoginPage } = await import('./LoginPage.vue');

let wrapper;
let replace;
async function render(query) {
    replace = vi.fn(() => Promise.resolve());
    wrapper = mount(LoginPage, {
        global: {
            plugins: [PrimeVue, createPinia()],
            mocks: { $route: { name: 'Login', query }, $router: { replace } }
        }
    });
    await flushPromises();
}
afterEach(() => {
    wrapper?.unmount();
    globalThis.HubOptions = {};
});

describe('LoginPage notice', () => {
    it('says the session has expired', async () => {
        globalThis.HubOptions = {};
        await render({ redirect: '/account', notice: 'expired' });
        const message = wrapper.find('.login-notice');
        expect(message.exists()).toBe(true);
        expect(message.text()).toBe('Your session has expired. Please sign in again.');
    });

    it('says nothing without the notice, or for another notice', async () => {
        globalThis.HubOptions = {};
        await render({ redirect: '/account' });
        expect(wrapper.find('.login-notice').exists()).toBe(false);
        wrapper.unmount();
        await render({ notice: 'denied:Users' });
        expect(wrapper.find('.login-notice').exists()).toBe(false);
    });
});

describe('LoginPage after sign-in', () => {
    it('returns to the page that asked, without a notice', async () => {
        globalThis.HubOptions = {};
        await render({ redirect: '/account?notice=expired&tab=2', notice: 'expired' });
        wrapper.vm.redirectAfterLogin();
        expect(replace).toHaveBeenCalledWith('/account?tab=2');
    });

    it('goes home otherwise', async () => {
        globalThis.HubOptions = {};
        await render({});
        wrapper.vm.redirectAfterLogin();
        expect(replace).toHaveBeenCalledWith({ name: 'Organizations' });
        wrapper.unmount();
        globalThis.HubOptions = { singleOrganization: 'acme' };
        await render({ redirect: '//evil.example' });
        wrapper.vm.redirectAfterLogin();
        expect(replace).toHaveBeenCalledWith({ name: 'Datasets', params: { org: 'acme' } });
    });
});

// ---- The sign-in form (FR-ACC-04, FR-ACC-05, FR-ACC-07, FR-XC-11) -------------------------------

const login = vi.fn();
// mapStores names the store by its $id
vi.mock('@/stores/auth', () => ({
    useAuthStore: Object.assign(() => ({ login, username: '', isLoggedIn: false }), { $id: 'auth' })
}));

async function renderForm() {
    const host = document.createElement('div');
    document.body.appendChild(host);
    replace = vi.fn(() => Promise.resolve());
    wrapper = mount(LoginPage, {
        attachTo: host,
        global: {
            plugins: [PrimeVue, createPinia()],
            mocks: { $route: { name: 'Login', query: {} }, $router: { replace } }
        }
    });
    await flushPromises();
    return host;
}
const fill = async (name, value) => {
    const input = wrapper.find(`input[name="${name}"]`);
    await input.setValue(value);
    await flushPromises();
};
const submit = async () => {
    await wrapper.find('form').trigger('submit');
    await flushPromises();
};
const deferred = () => {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
};

describe('LoginPage form', () => {
    afterEach(() => { wrapper?.unmount(); wrapper = null; document.body.innerHTML = ''; login.mockReset(); });

    it('is a real form with the autocomplete values, and the focus starts in Username (FR-ACC-07)', async () => {
        await renderForm();
        const form = wrapper.find('form');
        expect(form.exists()).toBe(true);
        expect(form.find('input[name="username"]').attributes('autocomplete')).toBe('username');
        expect(form.find('input[name="password"]').attributes('autocomplete')).toBe('current-password');
        expect(form.find('button[type="submit"]').text()).toContain('Login');
        expect(document.activeElement).toBe(wrapper.find('input[name="username"]').element);
    });

    it('sends no request for an empty submit and shows both field errors, with the focus on the first (FR-ACC-05)', async () => {
        await renderForm();
        await submit();
        expect(login).not.toHaveBeenCalled();
        const username = wrapper.find('input[name="username"]');
        const password = wrapper.find('input[name="password"]');
        expect(wrapper.find('#login-username-error').text()).toBe('Enter your username.');
        expect(wrapper.find('#login-password-error').text()).toBe('Enter your password.');
        expect(username.attributes('aria-invalid')).toBe('true');
        expect(username.attributes('aria-describedby')).toBe('login-username-error');
        expect(password.attributes('aria-invalid')).toBe('true');
        expect(password.attributes('aria-describedby')).toBe('login-password-error');
        expect(document.activeElement).toBe(username.element);
    });

    it('treats a username of spaces as empty, and trims the one it sends', async () => {
        await renderForm();
        await fill('username', '   ');
        await fill('password', 'secret');
        await submit();
        expect(login).not.toHaveBeenCalled();
        expect(wrapper.find('#login-username-error').exists()).toBe(true);

        login.mockResolvedValue({});
        await fill('username', 'admin ');
        await submit();
        expect(login).toHaveBeenCalledTimes(1);
        expect(login).toHaveBeenCalledWith('admin', 'secret');
    });

    it('two submits while the first request is pending call login once, and the fields are read-only (FR-ACC-04)', async () => {
        const pending = deferred();
        login.mockReturnValue(pending.promise);
        await renderForm();
        await fill('username', 'admin');
        await fill('password', 'secret');
        await submit();
        await submit();
        await submit();
        expect(login).toHaveBeenCalledTimes(1);
        expect(wrapper.find('input[name="username"]').attributes('readonly')).toBeDefined();
        expect(wrapper.find('input[name="password"]').attributes('readonly')).toBeDefined();
        pending.resolve({});
        await flushPromises();
        expect(replace).toHaveBeenCalledWith({ name: 'Organizations' });
        expect(wrapper.find('input[name="username"]').attributes('readonly')).toBeUndefined();
    });

    it('shows a refused sign-in as a plain message in the card, and typing clears it (FR-ACC-05)', async () => {
        const { ApiError } = await import('@/libs/ddb/apiError');
        login.mockRejectedValue(new ApiError('Unauthorized', 401));
        await renderForm();
        await fill('username', 'admin');
        await fill('password', 'wrong');
        await submit();
        const alert = wrapper.find('.login-form [role="alert"]');
        expect(alert.text()).toBe('Incorrect username or password.');
        // Inside the card, above the fields
        expect(wrapper.find('.p-card').element.contains(alert.element)).toBe(true);
        const html = wrapper.html();
        expect(html.indexOf('role="alert"')).toBeLessThan(html.indexOf('name="username"'));
        expect(wrapper.text()).not.toContain('Unauthorized');

        await fill('password', 'wrong2');
        expect(wrapper.find('.login-form [role="alert"]').exists()).toBe(false);
    });

    it('keeps the message of a failure that is not a refusal of the credentials', async () => {
        const { ApiError } = await import('@/libs/ddb/apiError');
        login.mockRejectedValue(new ApiError('Cannot login: network down', 0));
        await renderForm();
        await fill('username', 'admin');
        await fill('password', 'x');
        await submit();
        expect(wrapper.find('.login-form [role="alert"]').text()).toBe('Cannot login: network down');
    });

    it('shows a 400 of the server as the same plain message', async () => {
        const { ApiError } = await import('@/libs/ddb/apiError');
        login.mockRejectedValue(new ApiError('No auth data provided', 400));
        await renderForm();
        await fill('username', 'admin');
        await fill('password', 'x');
        await submit();
        expect(wrapper.find('.login-form [role="alert"]').text()).toBe('Incorrect username or password.');
    });

    it('shows a 400 ValidationProblemDetails as the same plain message, at no field (FR-ACC-05)', async () => {
        const { ApiError } = await import('@/libs/ddb/apiError');
        login.mockRejectedValue(new ApiError('One or more validation errors occurred.', 400, {
            type: 'https://tools.ietf.org/html/rfc9110#section-15.5.1', title: 'One or more validation errors occurred.', status: 400,
            errors: { Username: ['The Username field is required.'], Password: ['The Password field is required.'] }
        }));
        await renderForm();
        await fill('username', 'admin');
        await fill('password', 'x');
        await submit();
        expect(wrapper.find('.login-form [role="alert"]').text()).toBe('Incorrect username or password.');
        expect(wrapper.find('#login-username-error').exists()).toBe(false);
        expect(wrapper.find('#login-password-error').exists()).toBe(false);
        expect(wrapper.find('input[name="username"]').attributes('aria-invalid')).toBeUndefined();
        expect(wrapper.find('input[name="password"]').attributes('aria-invalid')).toBeUndefined();
        expect(wrapper.text()).not.toContain('field is required');
    });
});
