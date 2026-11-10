/**
 * The contour dialog closes without an error (FR-RAS-22): PrimeVue's Dialog focuses again, as
 * it hides, the element that had the focus when it showed. That is the opener, not one of its
 * InputNumbers, whose handlers fail once it is gone; and the focus goes back to the opener.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import ContourOptionsDialog from './ContourOptionsDialog.vue';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

describe('ContourOptionsDialog', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        document.body.innerHTML = '';
    });

    for (const how of ['Generate', 'Cancel']) {
        it(`closes after ${how} with no error, and gives the focus back to the opener`, async () => {
            const errors = vi.spyOn(console, 'error');
            const pageErrors = [];
            const onError = e => pageErrors.push(e.error || e.message);
            window.addEventListener('error', onError);
            const opener = document.createElement('button');
            document.body.appendChild(opener);
            opener.focus();

            // The real transition: its hooks are where the Dialog keeps and restores the focus
            const w = mount(ContourOptionsDialog, {
                props: { visible: true, unit: 'm' },
                attachTo: document.body,
                global: { plugins: [PrimeVue], stubs: { transition: false } }
            });
            await flushPromises();
            await wait(0);
            expect(document.activeElement.id).toBe('contour-options-dialog-interval');

            const button = [...document.querySelectorAll('.window-footer button')].find(b => b.textContent.includes(how));
            button.click();
            const event = how === 'Generate' ? 'generate' : 'cancel';
            expect(w.emitted(event)).toHaveLength(1);
            await w.setProps({ visible: false });
            await flushPromises();
            await wait(50);

            window.removeEventListener('error', onError);
            expect(pageErrors).toEqual([]);
            expect(errors).not.toHaveBeenCalled();
            expect(document.activeElement).toBe(opener);
            w.unmount();
        });
    }

    // FR-RAS-25: a thermal mosaic is not an elevation model
    describe('wording', () => {
        const labels = () => [...document.querySelectorAll('.contour-dialog-body label.form-label')].map(l => l.textContent.trim());
        const help = () => document.querySelector('.dialog-help').textContent.replace(/\s+/g, ' ').trim();
        const open = async props => {
            const w = mount(ContourOptionsDialog, {
                props: { visible: true, unit: 'm', ...props },
                attachTo: document.body,
                global: { plugins: [PrimeVue], stubs: { transition: false } }
            });
            await flushPromises();
            return w;
        };

        it('speaks of elevations for an elevation raster', async () => {
            const w = await open({ elevation: true });
            expect(help()).toContain('Generate contour lines from this elevation raster.');
            expect(labels()).toEqual(expect.arrayContaining(['Base elevation', 'Min elevation', 'Max elevation']));
            w.unmount();
        });

        it('speaks of values and of the raster for any other raster', async () => {
            const w = await open({ elevation: false, unit: '' });
            expect(help()).toContain('Generate contour lines from this raster.');
            expect(help()).not.toContain('elevation');
            expect(labels()).toEqual(expect.arrayContaining(['Interval (units)', 'Base value', 'Min value', 'Max value']));
            expect(labels().join(' ')).not.toContain('elevation');
            w.unmount();
        });

        it('says the same of the range that is wrong', async () => {
            const w = await open({ elevation: false });
            w.vm.minElev = 5;
            w.vm.maxElev = 2;
            await flushPromises();
            expect(document.querySelector('.form-error').textContent).toContain('Min value must be less than max value.');
            w.unmount();
        });

        it('asks for a narrower value range, not elevation range, before many levels (with the task of FR-RAS-11)', async () => {
            const w = await open({ elevation: false, rasterMin: 145, rasterMax: 402 });
            const warning = document.querySelector('[data-testid="contour-levels-warning"]').textContent.replace(/\s+/g, ' ').trim();
            expect(warning).toBe('About 257 contour levels (the range divided by the interval). A large raster can take several minutes, and the result is limited in size. Use a larger interval, or limit the value range, to make it faster.');
            w.unmount();
        });
    });
});
