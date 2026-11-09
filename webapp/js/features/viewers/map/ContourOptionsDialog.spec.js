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
});
