/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Listeners that remove themselves with their owner (HUB-08).
 *
 * Composition API (setup or another composable):
 *   useEventListener(window, 'resize', onResize);
 *   useEmitter('folderOpened', onFolderOpened);
 * Options API: `mixins: [lifecycleListenersMixin]`, then
 *   this.$listen(target, 'click', handler)  // DOM / EventDispatcher
 *   this.$onBus('addItems', handler)          // event bus
 *   this.$onOl(map.on('click', handler))      // OpenLayers key
 * Everything is removed when the scope is disposed / the component unmounts.
 */
import { getCurrentScope, onScopeDispose } from 'vue';
import emitter from '@/libs/eventBus';
import { ListenerBag } from '@/libs/listenerBag';

function scopedBag() {
    const bag = new ListenerBag();
    if (getCurrentScope()) onScopeDispose(() => bag.dispose());
    return bag;
}

/** addEventListener removed with the current component / effect scope. */
export function useEventListener(target, type, handler, options) {
    return scopedBag().add(target, type, handler, options);
}

/** Event bus subscription removed with the current component / effect scope. */
export function useEmitter(event, handler, bus = emitter) {
    return scopedBag().bus(bus, event, handler);
}

export const lifecycleListenersMixin = {
    beforeCreate() {
        this._listenerBag = new ListenerBag();
    },
    beforeUnmount() {
        this._listenerBag.dispose();
    },
    methods: {
        $listen(target, type, handler, options) {
            return this._listenerBag.add(target, type, handler, options);
        },
        $onBus(event, handler, bus = emitter) {
            return this._listenerBag.bus(bus, event, handler);
        },
        $onOl(keys) {
            return this._listenerBag.ol(keys);
        }
    }
};
