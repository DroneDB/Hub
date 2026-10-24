// @ts-check
/**
 * useDialogs - dialogs opened on demand and rendered inside the app (HQ-07/HQ-09).
 * Replaces separate `createApp()` mounts (which got no theme, router, stores or toast
 * host) and per-dialog boolean flags.
 *
 *   setup() { return { dialogs: useDialogs() }; }          // template: <DialogHost :dialogs="dialogs" />
 *   const result = await this.dialogs.open(RenameDialog, { entry, onSave: ... });
 *   this.dialogs.open('rename', { path }) ... this.dialogs.close('rename', 'b.jpg');   // named, with a component map on DialogHost
 *
 * Props may be a function returning them (re-read on render: reactive, e.g. `busy`); an
 * `onClose` among them receives every argument of the event.
 *
 * A dialog closes (and its promise resolves with the event's first argument) when it
 * emits `close` (Window's contract, HQ-09); the returned promise also has `close(result)`.
 */
import { shallowRef, markRaw } from 'vue';

/**
 * @typedef {{ id: number, name: string|null, component: object|null, props: Record<string, any> | (() => Record<string, any>), finish: (result?: any) => void }} DialogEntry
 * @typedef {Promise<any> & { close: (result?: any) => void }} DialogHandle
 */

export function useDialogs() {
    /** @type {import('vue').ShallowRef<DialogEntry[]>} */
    const stack = shallowRef([]);
    let seq = 0;

    /**
     * @param {string|object} nameOrComponent  a name known to the DialogHost, or a component
     * @param {Record<string, any> | (() => Record<string, any>)} [props]  props and `on…` listeners
     * @returns {DialogHandle}
     */
    function open(nameOrComponent, props = {}) {
        const id = ++seq;
        /** @type {(result?: any) => void} */
        let finish = () => {};
        const promise = /** @type {DialogHandle} */ (new Promise(resolve => {
            finish = result => {
                if (!stack.value.some(d => d.id === id)) return;
                stack.value = stack.value.filter(d => d.id !== id);
                resolve(result);
            };
        }));
        const named = typeof nameOrComponent === 'string';
        stack.value = [...stack.value, {
            id,
            name: named ? nameOrComponent : null,
            component: named ? null : markRaw(nameOrComponent),
            props,
            finish
        }];
        promise.close = result => finish(result);
        return promise;
    }

    /**
     * Closes the most recent dialog with this name (or id).
     * @param {string|number} nameOrId @param {any} [result]
     */
    function close(nameOrId, result) {
        const entry = [...stack.value].reverse().find(d => d.id === nameOrId || d.name === nameOrId);
        entry?.finish(result);
    }

    /** @param {string} name */
    const isOpen = name => stack.value.some(d => d.name === name);

    return { stack, open, close, isOpen };
}

