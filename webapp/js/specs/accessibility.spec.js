/**
 * No icon-only button without an accessible name, no clickable div/span without a role
 * (or hidden from screen readers, as a mouse shortcut for a key), every <img> has alt.
 */
import { describe, it, expect } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import PrimeVue from 'primevue/config';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
function walk(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out); else if (e.name.endsWith('.vue')) out.push(p);
    }
    return out;
}
const templates = walk(ROOT).map(p => [path.relative(ROOT, p), (fs.readFileSync(p, 'utf8').match(/<template>([\s\S]*)<\/template>/) || ['', ''])[1]]);
const find = re => templates.flatMap(([f, t]) => [...t.matchAll(re)].map(m => `${f}: ${m[0].slice(0, 80)}`));

describe('accessibility of the templates', () => {
    it('icon-only buttons have an accessible name', () => {
        const prime = find(/<Button\b(?![^>]*\b(?::?label|:?aria-label)=)[^>]*\bicon=[^>]*>/g);
        const native = find(/<button\b(?![^>]*aria-label=)[^>]*>\s*<i\b[^>]*?\/?>\s*(?:<\/i>)?\s*<\/button>/g);
        expect([...prime, ...native]).toEqual([]);
    });

    it('clickable div/span elements have a role', () => {
        expect(find(/<(div|span)\b(?![^>]*\b(?:role|aria-hidden)=)[^>]*@click[^>]*>/g)).toEqual([]);
    });

    it('images have alt text', () => {
        expect(find(/<img\b(?![^>]*\b:?alt=)[^>]*>/g)).toEqual([]);
    });
});

// FR-NAV-02: the skip link first, the header as the banner, the page in the one main landmark
describe('the landmarks of the app', () => {
    it('renders the skip link first, then the banner and the main landmark, which the skip link focuses', async () => {
        const { default: App } = await import('@/App.vue');
        const router = createRouter({
            history: createMemoryHistory(),
            routes: [{
                path: '/', components: {
                    header: { template: '<header id="header"><nav aria-label="Main" /></header>' },
                    content: { template: '<div class="page"><h1>Page</h1></div>' }
                }
            }]
        });
        await router.push('/');
        const host = document.createElement('div');
        host.id = 'app';
        document.body.append(host);
        const wrapper = mount(App, { global: { plugins: [router, PrimeVue] }, attachTo: host });
        await flushPromises();
        const app = host;
        const skip = app.querySelector('a.skip-link[href="#main"]');
        const header = app.querySelector('header');
        const main = app.querySelector('main#main');
        expect(skip.textContent).toBe('Skip to main content');
        // The first Tab stop: before the header and the page
        expect(app.querySelector('a, button, [tabindex]')).toBe(skip);
        expect(skip.compareDocumentPosition(header) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(header.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(main.getAttribute('tabindex')).toBe('-1');
        expect(main.querySelector('.page h1')).not.toBeNull();
        expect(app.querySelectorAll('main')).toHaveLength(1);

        await wrapper.find('a.skip-link').trigger('click');
        expect(document.activeElement).toBe(main);
        wrapper.unmount();
        host.remove();
    });

    it('gives Login and the page of an unknown address an h1, and the Account cards h2', () => {
        const source = name => templates.find(([f]) => f.endsWith(name))[1];
        expect(source('LoginPage.vue')).toMatch(/<h1>Welcome Back<\/h1>/);
        expect(source('AccountPage.vue')).not.toMatch(/<h3\b/);
        expect(source('NotFound.vue')).toMatch(/<ResourceState kind="not-found"/);
    });
});
