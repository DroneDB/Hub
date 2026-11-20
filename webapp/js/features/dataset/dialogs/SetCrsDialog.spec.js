/**
 * The Set Coordinate System dialog (FR-PRC-31, FR-XC-11, D-046): the form of the value (an EPSG code or WKT) is checked at the
 * field before Apply, and Apply stays enabled; a value of the right form that the server refuses gets the server's error under
 * the same field; a bare number is an EPSG code; the dialog does not point to itself.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import ddb from 'ddb';
import SetCrsDialog from './SetCrsDialog.vue';
import { ApiError } from '@/libs/ddb/apiError';

vi.mock('@/libs/build/buildManager', () => ({ default: {}, BUILD_STATES: {} }));
vi.mock('@/libs/tasks/taskMonitor', () => ({ default: {} }));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: {} }));

const T = ddb.entry.type;
const WindowStub = {
    props: ['busy', 'confirmLabel', 'confirmDisabled'],
    emits: ['confirm', 'close'],
    template: '<div><slot /><button type="button" data-confirm :disabled="confirmDisabled || busy" @click="$emit(\'confirm\')">{{ confirmLabel }}</button></div>'
};

const setCadCrs = vi.fn();
let wrapper;
async function render(properties = {}) {
    wrapper = mount(SetCrsDialog, {
        props: { file: { entry: { type: T.VECTOR, path: 'site/plan.dwg', properties } }, dataset: { setCadCrs } },
        attachTo: document.body,
        global: { plugins: [PrimeVue], stubs: { Window: WindowStub } }
    });
    await flushPromises();
}
const input = () => wrapper.find('input[name="crs"]');
const type = async value => { await input().setValue(value); await flushPromises(); };
const apply = async () => { await wrapper.find('[data-confirm]').trigger('click'); await flushPromises(); };
const error = () => wrapper.find('#set-crs-error');
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; setCadCrs.mockReset(); });

describe('SetCrsDialog', () => {
    it('starts from the current setting of the drawing', async () => {
        await render({ vector: { crs: { source: 'prj', label: 'EPSG:32632' } } });
        expect(input().element.value).toBe('EPSG:32632');
        expect(wrapper.find('#crsModeSystem').element.checked).toBe(true);

        wrapper.unmount();
        await render({ vector: { crs: { source: 'prj', label: 'local' } } });
        expect(wrapper.find('#crsModeLocal').element.checked).toBe(true);
    });

    it('keeps Apply enabled with an empty field, and an empty submit says what is wanted at the field', async () => {
        await render();
        expect(error().exists()).toBe(false);
        expect(wrapper.find('[data-confirm]').attributes('disabled')).toBeUndefined();
        await apply();
        expect(setCadCrs).not.toHaveBeenCalled();
        expect(error().text()).toBe('Enter a coordinate system.');
        expect(input().attributes('aria-invalid')).toBe('true');
    });

    it("marks 'abc' invalid at the field and sends no request", async () => {
        await render();
        await type('abc');
        expect(error().text()).toBe('Enter an EPSG code (such as 32632 or EPSG:32632) or a WKT definition (starting with PROJCS or GEOGCS).');
        expect(input().attributes('aria-describedby')).toBe('set-crs-error');
        await apply();
        expect(setCadCrs).not.toHaveBeenCalled();
        expect(wrapper.emitted('close')).toBeUndefined();
    });

    it("accepts '32632' as an EPSG code, and WKT, and sends the request", async () => {
        setCadCrs.mockResolvedValue({ path: 'site/plan.prj' });
        await render();
        await type('32632');
        expect(error().exists()).toBe(false);
        await apply();
        expect(setCadCrs).toHaveBeenCalledExactlyOnceWith('site/plan.dwg', 'EPSG:32632');
        expect(wrapper.emitted('close')).toEqual([['set', { prjPath: 'site/plan.prj' }]]);

        setCadCrs.mockClear();
        wrapper.unmount();
        await render();
        await type('PROJCS["x",GEOGCS["y"]]');
        await apply();
        expect(setCadCrs).toHaveBeenCalledWith('site/plan.dwg', 'PROJCS["x",GEOGCS["y"]]');
    });

    // The server refuses what only it can judge: '99999999' has the form of an EPSG code
    it("shows the server's 400 for a value of the right form under the field, and stays open", async () => {
        setCadCrs.mockRejectedValue(new ApiError('Not a coordinate system: EPSG:99999999', 400));
        await render();
        await type('99999999');
        expect(error().exists()).toBe(false);
        await apply();
        expect(setCadCrs).toHaveBeenCalledWith('site/plan.dwg', 'EPSG:99999999');
        expect(error().text()).toBe('Not a coordinate system: EPSG:99999999');
        expect(input().attributes('aria-invalid')).toBe('true');
        expect(wrapper.emitted('close')).toBeUndefined();
        expect(wrapper.find('.form-error').exists()).toBe(false);

        // editing the value clears it
        await type('2193');
        expect(error().exists()).toBe(false);
    });

    it('shows the 400 for a WKT that does not parse under the field', async () => {
        setCadCrs.mockRejectedValue(new ApiError('Cannot parse the definition', 400));
        await render();
        await type('PROJCS["bogus"]');
        await apply();
        expect(error().text()).toBe('Cannot parse the definition');
    });

    it('says an error that is not a refusal of the value in the dialog, not at the field', async () => {
        setCadCrs.mockRejectedValue(new ApiError('Internal server error', 500));
        await render();
        await type('32632');
        await apply();
        expect(error().exists()).toBe(false);
        expect(wrapper.find('.form-error').text()).toContain('Internal server error');
    });

    it('applies the local choice without a value to check', async () => {
        setCadCrs.mockResolvedValue({ path: 'site/plan.prj' });
        await render();
        await wrapper.find('#crsModeLocal').setValue(true);
        await apply();
        expect(setCadCrs).toHaveBeenCalledExactlyOnceWith('site/plan.dwg', 'local');
    });

    it('does not tell, in the dialog that sets it, to set the coordinate system with Tools', async () => {
        await render({ vector: { crs: { source: 'none' } } });
        expect(wrapper.text()).toContain('Now: None: local drawing coordinates');
        expect(wrapper.text()).not.toContain('Tools › Set Coordinate System');
    });
});
