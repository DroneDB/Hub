import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import UpdateNotesDialog from './UpdateNotesDialog.vue';

const INFO = {
    currentVersion: '2.0.0',
    latestVersion: '2.1.0',
    isSecurityUpdate: false,
    releaseNotes: '## Fixed\n\n- a **bug**',
    compareUrl: 'https://github.com/DroneDB/Registry/compare/v2.0.0...v2.1.0',
    licenseRequestUrl: 'https://dronedb.app/request-license?instance=abc',
    useDeclaration: null
};

let wrapper;
const open = async info => {
    wrapper = mount(UpdateNotesDialog, { props: { info: { ...INFO, ...info } }, attachTo: document.body, global: { plugins: [PrimeVue] } });
    await wrapper.vm.$nextTick();
    return document.getElementById('updateNotesDialog');
};
const link = text => [...document.querySelectorAll('a')].find(a => a.textContent.includes(text));

afterEach(() => wrapper?.unmount());

describe('UpdateNotesDialog', () => {
    it('names the new and the installed version', async () => {
        const dialog = await open();
        expect(dialog.textContent).toContain('Registry 2.1.0 is available (installed: 2.0.0)');
        expect(dialog.querySelector('.release-notes strong').textContent).toBe('bug');
    });

    it('shows the security line only for a security update', async () => {
        expect((await open()).textContent).not.toContain('This update contains security fixes.');
        wrapper.unmount();
        expect((await open({ isSecurityUpdate: true })).textContent).toContain('This update contains security fixes.');
    });

    it('renders the notes without scripts, event handlers or images', async () => {
        const dialog = await open({ releaseNotes: '<script>alert(1)</script>\n\n![tracker](https://evil.example/t.png)\n\n[x](javascript:alert(1))' });
        const notes = dialog.querySelector('.release-notes');
        expect(notes.querySelector('script, img')).toBeNull();
        expect(notes.innerHTML).not.toContain('evil.example');
        expect(notes.innerHTML).not.toMatch(/href="javascript:/);
    });

    it('opens the links of the notes in a new tab, and only web addresses', async () => {
        const dialog = await open({ releaseNotes: 'See [the issue](https://github.com/DroneDB/Registry/issues/1) or [mail](mailto:a@b.test)' });
        const links = [...dialog.querySelectorAll('.release-notes a')];
        expect(links.map(a => a.getAttribute('href'))).toEqual(['https://github.com/DroneDB/Registry/issues/1']);
        expect(links[0].getAttribute('target')).toBe('_blank');
        expect(links[0].getAttribute('rel')).toBe('noopener noreferrer');
    });

    it('links to all changes and to the licence request in a new tab', async () => {
        await open();
        const changes = link('All changes on GitHub');
        expect(changes.getAttribute('href')).toBe(INFO.compareUrl);
        expect(changes.getAttribute('target')).toBe('_blank');
        expect(changes.getAttribute('rel')).toContain('noopener');
        const licence = link('Get a licence');
        expect(licence.getAttribute('href')).toBe(INFO.licenseRequestUrl);
        expect(licence.getAttribute('target')).toBe('_blank');
        expect(licence.getAttribute('rel')).toContain('noopener');
    });

    it('hides the licence link for a deployment that holds a licence', async () => {
        await open({ useDeclaration: 'commercial_licensed' });
        expect(link('Get a licence')).toBeUndefined();
        expect(link('All changes on GitHub')).toBeDefined();
    });

    it('emits close from the Close button', async () => {
        await open();
        [...document.querySelectorAll('button')].find(b => b.textContent.includes('Close')).click();
        expect(wrapper.emitted('close')).toBeTruthy();
    });
});
