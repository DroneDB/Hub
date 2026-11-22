/**
 * The annotation fields of the two properties dialogs: reference, category, severity, status, assignee, due date and
 * whether the annotation is in reports. Every field has a label; the choices are the schema's; a value the schema does
 * not have stays selectable; the model is what is stored; the form says whether it can be saved.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import Select from 'primevue/select';
import AnnotationFields from './AnnotationFields.vue';
import { DEFAULT_SCHEMA } from '@/libs/reports/reportSettings';

let wrapper;
async function show(props = {}) {
    wrapper = mount(AnnotationFields, {
        props: { schema: DEFAULT_SCHEMA, idPrefix: 'x', ...props },
        attachTo: document.body,
        global: { plugins: [PrimeVue] }
    });
    await flushPromises();
    return wrapper;
}
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
});

const field = id => /** @type {HTMLInputElement} */ (document.getElementById(`x-${id}`));
const labelFor = id => document.querySelector(`label[for="x-${id}"]`)?.textContent.trim();
const lastModel = () => wrapper.emitted('update:modelValue').at(-1)[0];
const valid = () => wrapper.emitted('update:valid').at(-1)[0];
async function type(id, value) {
    field(id).value = value;
    field(id).dispatchEvent(new Event('input'));
    await flushPromises();
}
// The choice a user makes in the list of a select: the select says which value it took
async function choose(id, value) {
    const select = wrapper.findAllComponents(Select).find(s => s.props('inputId') === `x-${id}`);
    select.vm.$emit('update:modelValue', value);
    await flushPromises();
}

describe('the fields', () => {
    it('are all there with a label: reference, category, severity, status, assignee, due date, in reports', async () => {
        await show();
        expect(['ref', 'category', 'severity', 'status', 'assignee', 'due', 'report'].map(labelFor)).toEqual(
            ['Reference', 'Category', 'Severity', 'Status', 'Assignee', 'Due date', 'Include in reports']);
        expect(document.querySelector('legend').textContent).toBe('Inspection');
        // A select is named by its label too (the input of a select is not the control a screen reader reaches)
        ['category', 'severity', 'status'].forEach(id => expect(document.getElementById(`x-${id}-label`)).not.toBeNull());
    });

    it('show the values of the model, and nothing for a new annotation: no category, severity or status', async () => {
        await show();
        expect(field('ref').value).toBe('');
        expect(field('assignee').value).toBe('');
        expect(field('due').value).toBe('');
        expect(field('report').checked).toBe(true);
        expect(document.querySelectorAll('.p-select-label.p-placeholder').length).toBe(3);

        wrapper.unmount();
        await show({ modelValue: { ref: '7', category: 'defect', status: 'open', assignee: 'Anna', dueDate: '2026-12-01', report: false } });
        expect(field('ref').value).toBe('7');
        expect(field('assignee').value).toBe('Anna');
        expect(field('due').value).toBe('2026-12-01');
        expect(field('report').checked).toBe(false);
        const labels = [...document.querySelectorAll('.p-select-label')].map(l => l.textContent.trim());
        expect(labels[0]).toBe('Defect');
        expect(labels[2]).toBe('Open');
    });

    it('offer the choices of the schema, in its order', async () => {
        await show({ schema: { categories: [{ id: 'b', name: 'Beta', colour: '#000000' }, { id: 'a', name: 'Alpha', colour: '#000000' }], severities: [], statuses: [{ id: 's', name: 'Seen', closed: false }] } });
        field('category').closest('.p-select').click();
        await flushPromises();
        expect([...document.querySelectorAll('.p-select-option')].map(o => o.textContent.trim())).toEqual(['Beta', 'Alpha']);
    });

    it('have no severity when the schema has none, unless the annotation has one', async () => {
        const schema = { categories: DEFAULT_SCHEMA.categories, severities: [], statuses: DEFAULT_SCHEMA.statuses };
        await show({ schema });
        expect(labelFor('severity')).toBeUndefined();
        wrapper.unmount();
        await show({ schema, modelValue: { severity: 'high' } });
        expect(labelFor('severity')).toBe('Severity');
        expect(document.querySelectorAll('.p-select-label')[1].textContent.trim()).toBe('Unknown (high)');
    });

    it('keep a value the schema does not have, as Unknown (<id>)', async () => {
        await show({ modelValue: { category: 'gone' } });
        expect(document.querySelectorAll('.p-select-label')[0].textContent.trim()).toBe('Unknown (gone)');
    });
});

describe('the model', () => {
    it('is changed one field at a time, an empty field being absent', async () => {
        await show({ modelValue: { category: 'defect' } });
        await type('assignee', 'Anna');
        expect(lastModel()).toEqual({ category: 'defect', assignee: 'Anna' });
        await type('assignee', '');
        expect(lastModel().assignee).toBeUndefined();
        await type('due', '2026-12-01');
        expect(lastModel().dueDate).toBe('2026-12-01');
    });

    it('takes a choice from the list, and clears it', async () => {
        await show();
        await choose('status', 'in-progress');
        expect(lastModel().status).toBe('in-progress');
        await choose('category', 'safety');
        expect(lastModel().category).toBe('safety');
        // The clear button of a select gives null
        await wrapper.setProps({ modelValue: lastModel() });
        await choose('status', null);
        expect(lastModel().status).toBeUndefined();
        expect(lastModel().category).toBe('safety');
    });

    it('stores report only when the annotation is left out of reports', async () => {
        await show();
        field('report').click();
        await flushPromises();
        expect(lastModel().report).toBe(false);
        await wrapper.setProps({ modelValue: lastModel() });
        field('report').click();
        await flushPromises();
        expect(lastModel().report).toBeUndefined();
    });
});

describe('what can be saved', () => {
    it('is not a reference another annotation has: the message, the field marked and the form not valid', async () => {
        await show({ isRefTaken: ref => ref === '3' });
        expect(valid()).toBe(true);
        await wrapper.setProps({ modelValue: { ref: '3' } });
        expect(document.getElementById('x-ref-error').textContent).toBe('Reference 3 is already used');
        expect(field('ref').getAttribute('aria-invalid')).toBe('true');
        expect(field('ref').getAttribute('aria-describedby')).toBe('x-ref-error');
        expect(valid()).toBe(false);
        await wrapper.setProps({ modelValue: { ref: '4' } });
        expect(document.getElementById('x-ref-error')).toBeNull();
        expect(valid()).toBe(true);
    });

    it('is not a reference of more than 8 characters or with other characters than letters, digits and dashes', async () => {
        await show();
        for (const bad of ['123456789', 'a b', 'a_b']) {
            await wrapper.setProps({ modelValue: { ref: bad } });
            expect(valid()).toBe(false);
            expect(document.getElementById('x-ref-error').textContent).toContain('1 to 8');
        }
        await wrapper.setProps({ modelValue: { ref: 'A-12' } });
        expect(valid()).toBe(true);
    });

    it('limits the assignee to 100 characters and the reference to 8 while typing', async () => {
        await show();
        expect(field('assignee').maxLength).toBe(100);
        expect(field('ref').maxLength).toBe(8);
    });

    it('is not a due date that is not a date', async () => {
        await show();
        await wrapper.setProps({ modelValue: { dueDate: '2026-02-30' } });
        expect(valid()).toBe(false);
        expect(document.getElementById('x-due-error').textContent).toBe('Enter a valid date');
        await wrapper.setProps({ modelValue: { dueDate: '2026-02-28' } });
        expect(valid()).toBe(true);
    });
});
