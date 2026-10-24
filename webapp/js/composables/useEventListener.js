/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Listeners that remove themselves with their owner (HUB-08).
 *
 * Composition API (setup or another composable):
 *   useEventListener(window, 'resize', onResize);
 * Options API: `setup() { return { listeners: useListenerBag() }; }`, then
 *   this.listeners.add(target, 'click', handler)          // DOM / EventDispatcher
 *   this.listeners.bus(emitter, 'addItems', handler)      // event bus
 *   this.listeners.ol(map.on('click', handler))           // OpenLayers key
 * Everything is removed when the scope is disposed / the component unmounts (HQ-06: the
 * lifecycleListenersMixin twin is gone).
 */
import { getCurrentScope, onScopeDispose } from 'vue';
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

/**
 * A ListenerBag disposed with the current component / effect scope, for code that
 * registers from methods (Options API): `setup() { return { listeners: useListenerBag() }; }`
 * then `this.listeners.ol(map.on('click', fn))`, `this.listeners.bus(emitter, 'addItems', fn)`.
 */
export function useListenerBag() {
    return scopedBag();
}
