/**
 * notify: the toast group (FR-XC-09) and the one action of a toast (FR-XC-23). The values are literal: what the
 * PrimeVue service must receive.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { notify, setToastService, setToastGroupResolver, runToastAction, VIEWER_GROUP } from './notify';

let add;
let remove;

beforeEach(() => {
    add = vi.fn();
    remove = vi.fn();
    setToastService({ add, remove });
});

afterEach(() => {
    setToastGroupResolver(null);
    setToastService(null);
});

describe('notify group (FR-XC-09)', () => {
    it('sends no group by default, and the group that a call names', () => {
        notify.info('Plain');
        notify.warn('No splat there', { summary: 'Splat', group: 'viewer' });
        expect(add.mock.calls[0][0]).not.toHaveProperty('group');
        expect(add.mock.calls[1][0]).toMatchObject({ severity: 'warn', summary: 'Splat', detail: 'No splat there', group: 'viewer' });
        expect(VIEWER_GROUP).toBe('viewer');
    });

    it('gives the toasts of a viewer route the group of the resolver, unless a call names another', () => {
        setToastGroupResolver(() => 'viewer');
        notify.success('Altitude adjusted');
        notify.success('Elsewhere', { group: 'other' });
        expect(add.mock.calls[0][0].group).toBe('viewer');
        expect(add.mock.calls[1][0].group).toBe('other');

        setToastGroupResolver(() => undefined);
        notify.success('Back on a page');
        expect(add.mock.calls[2][0]).not.toHaveProperty('group');
    });
});

describe('notify action (FR-XC-23)', () => {
    it('carries one action in the data of the toast, and stays long enough to reach it', () => {
        const run = vi.fn();
        notify.success('File moved successfully', { summary: 'Moved', action: { label: 'Undo', run } });
        const message = add.mock.calls[0][0];
        expect(message).toMatchObject({ severity: 'success', summary: 'Moved', detail: 'File moved successfully', life: 5000 });
        expect(message.data.action.label).toBe('Undo');
        // A success toast without an action lasts 3000 ms
        notify.success('Saved');
        expect(add.mock.calls[1][0].life).toBe(3000);
        // A life that the call gives is kept
        notify.success('Kept', { life: 'short', action: { label: 'Undo', run } });
        expect(add.mock.calls[2][0].life).toBe(3000);
    });

    it('runs the action and closes the toast', () => {
        const run = vi.fn();
        notify.info('Layer added', { action: { label: 'Zoom to layer', run } });
        const message = add.mock.calls[0][0];
        runToastAction(message);
        expect(run).toHaveBeenCalledTimes(1);
        expect(remove).toHaveBeenCalledWith(message);
    });

    it('runs the action once: a second click while the toast closes does nothing', () => {
        const run = vi.fn();
        notify.success('File moved successfully', { action: { label: 'Undo', run } });
        const message = add.mock.calls[0][0];

        runToastAction(message);
        runToastAction(message);

        expect(run).toHaveBeenCalledTimes(1);
        expect(remove).toHaveBeenCalledTimes(1);
        expect(message.data.done).toBe(true);
    });

    it('closes the toast even when the action throws, and does nothing for a toast without one', () => {
        notify.info('Boom', { action: { label: 'Go', run: () => { throw new Error('boom'); } } });
        const message = add.mock.calls[0][0];
        expect(() => runToastAction(message)).toThrow('boom');
        expect(remove).toHaveBeenCalledWith(message);

        remove.mockClear();
        runToastAction({ severity: 'info' });
        expect(remove).not.toHaveBeenCalled();
    });
});
