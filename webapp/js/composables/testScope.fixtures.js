import { effectScope } from 'vue';
import { afterEach } from 'vitest';

/**
 * A runner of composables inside an effect scope that ends with each test, as the scope of the component that
 * uses them ends with it: the timers, watchers and listeners a composable owns are stopped after the test, so
 * none fires once the test environment is torn down. Call it at the top of a spec file.
 * @returns {<T>(fn: () => T) => T}
 */
export function useTestScope() {
    /** @type {import('vue').EffectScope | null} */
    let scope = null;
    afterEach(() => {
        scope?.stop();
        scope = null;
    });
    return fn => {
        if (!scope) scope = effectScope();
        return /** @type {any} */ (scope.run(fn));
    };
}
