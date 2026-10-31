/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Listeners that remove themselves with their owner.
 *
 * Composition API (setup or another composable):
 *   useEventListener(window, 'resize', onResize);
 * Options API: `setup() { return { listeners: useListenerBag() }; }`, then
 *   this.listeners.add(target, 'click', handler)          // DOM / EventDispatcher
 *   this.listeners.bus(emitter, 'addItems', handler)      // event bus
 *   this.listeners.ol(map.on('click', handler))           // OpenLayers key
 * Everything is removed when the scope is disposed / the component unmounts.
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

/**
 * A ResizeObserver on `element`, disconnected with the current component / effect scope:
 * for a canvas library that only follows the window's size, while its container also changes
 * with the page around it.
 *   onMounted(() => useResizeObserver(container.value, () => viewer?.autoSize()));
 */
export function useResizeObserver(element, callback) {
    if (!element || typeof ResizeObserver === 'undefined') return null;
    const observer = new ResizeObserver(callback);
    observer.observe(element);
    if (getCurrentScope()) onScopeDispose(() => observer.disconnect());
    return observer;
}
