// @ts-check
/**
 * createFeatureScope - turns a mixin-shaped feature definition into a composable.
 *
 * The feature's state, methods, computed values and watchers live on their own reactive
 * scope object (`this` inside the methods), not on the host component, and everything
 * the feature needs from outside is declared in `externals`. Teardown runs when the
 * owning component unmounts.
 *
 *   export function useContourLines(ctx) {
 *       return createFeatureScope({
 *           data: () => ({ contourDialogVisible: false }),
 *           methods: { openContourDialog() { ... this.dataset ... } },
 *           externals: { dataset: ctx.dataset, showAlert: () => ctx.showAlert }
 *       });
 *   }
 *
 * `externals`: name -> a ref (read and written through) or a getter function.
 * Returns refs for every public (not `_`-prefixed) state key and computed value, plus the
 * public methods, ready to spread into setup()'s return.
 */
import { reactive, toRef, computed, watch, isRef, getCurrentInstance, onMounted, onBeforeUnmount } from 'vue';

/**
 * @param {object} def
 * @param {() => Record<string, any>} [def.data]
 * @param {Record<string, Function>} [def.methods]
 * @param {Record<string, Function>} [def.computed]
 * @param {Record<string, Function>} [def.watch]
 * @param {Record<string, import('vue').Ref<any>|(() => any)>} [def.externals]
 * @param {Function} [def.mounted]
 * @param {Function} [def.beforeUnmount]
 * @returns {Record<string, any>}
 */
export function createFeatureScope({ data = () => ({}), methods = {}, computed: computedDefs = {}, watch: watchDefs = {}, externals = {}, mounted, beforeUnmount }) {
    const state = data();
    const target = { ...state };
    for (const [name, source] of Object.entries(externals)) {
        Object.defineProperty(target, name, isRef(source)
            ? { get: () => source.value, set: v => { source.value = v; }, enumerable: false, configurable: true }
            : { get: source, enumerable: false, configurable: true });
    }
    Object.assign(target, methods);
    const self = reactive(target);

    /** @type {Record<string, any>} */
    const exported = {};
    // `_`-prefixed members are the feature's own (and Vue does not expose them from setup)
    const isPublic = key => !key.startsWith('_');
    for (const key of Object.keys(state).filter(isPublic)) exported[key] = toRef(self, key);
    for (const [name, fn] of Object.entries(computedDefs)) {
        const value = computed(() => fn.call(self));
        Object.defineProperty(target, name, { get: () => value.value, enumerable: false, configurable: true });
        exported[name] = value;
    }
    for (const name of Object.keys(methods).filter(isPublic)) exported[name] = (...args) => self[name](...args);
    for (const [key, handler] of Object.entries(watchDefs)) watch(() => self[key], (...args) => handler.apply(self, args));

    if (getCurrentInstance()) {
        if (mounted) onMounted(() => mounted.call(self));
        if (beforeUnmount) onBeforeUnmount(() => beforeUnmount.call(self));
    }
    return exported;
}
