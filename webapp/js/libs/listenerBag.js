/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * ListenerBag - every listener an owner (component, OpenLayers control, viewer session)
 * registers, removed in one dispose() (HUB-08). Registration goes through the bag, so a
 * listener cannot be added without the code that removes it.
 *
 * - add(target, type, handler, options): DOM EventTarget, three.js/Potree/Giro3D
 *   EventDispatcher (anything with addEventListener/removeEventListener);
 * - adopt(target, type, handler, options): a listener someone else already added, which the
 *   bag removes with the others (third-party code that registers its own);
 * - ol(key | key[]): an OpenLayers listener key (from `observable.on(...)`), removed with unByKey;
 * - bus(emitter, event, handler): a mitt-style event bus (`on`/`off`).
 * Each returns a function that removes that one listener early.
 */
export class ListenerBag {
    constructor() {
        this.disposers = new Set();
    }

    add(target, type, handler, options) {
        if (!target) return () => {};
        target.addEventListener(type, handler, options);
        return this.adopt(target, type, handler, options);
    }

    adopt(target, type, handler, options) {
        if (!target) return () => {};
        const disposer = this._track(() => target.removeEventListener(type, handler, options));
        disposer.registration = { target, type, handler };
        return disposer;
    }

    /** Removes a listener added with add(), found by what it was added with. */
    remove(target, type, handler) {
        for (const disposer of this.disposers) {
            const r = disposer.registration;
            if (r && r.target === target && r.type === type && r.handler === handler) {
                disposer();
                return;
            }
        }
        // Not ours (added before the bag existed): remove it anyway
        target?.removeEventListener?.(type, handler);
    }

    ol(keys) {
        const list = Array.isArray(keys) ? keys : [keys];
        return this._track(() => {
            for (const key of list) {
                // OpenLayers' unByKey, without importing OpenLayers here: a key is
                // { target, type, listener }
                key?.target?.removeEventListener?.(key.type, key.listener);
            }
        });
    }

    bus(emitter, event, handler) {
        emitter.on(event, handler);
        return this._track(() => emitter.off(event, handler));
    }

    _track(remove) {
        let removed = false;
        const disposer = () => {
            if (removed) return;
            removed = true;
            this.disposers.delete(disposer);
            try {
                remove();
            } catch {
                /* the target is already gone */
            }
        };
        this.disposers.add(disposer);
        return disposer;
    }

    get size() {
        return this.disposers.size;
    }

    dispose() {
        for (const disposer of [...this.disposers]) disposer();
    }
}
