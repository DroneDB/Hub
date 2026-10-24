/**
 * Unit tests for composables/useRequestScope.js (HUB-06)
 * Run with: npx vitest run webapp/js/composables/useRequestScope.spec.js
 */
import { describe, it, expect } from 'vitest';
import { effectScope } from 'vue';
import { useRequestScope, isAbort } from '@/composables/useRequestScope';

describe('useRequestScope', () => {
    it('aborts the requests of a component when it unmounts', () => {
        const scope = effectScope();
        const { signal } = scope.run(() => useRequestScope());
        expect(signal.aborted).toBe(false);
        scope.stop();
        expect(signal.aborted).toBe(true);
    });

    it('tells an abort from a failure', () => {
        expect(isAbort(Object.assign(new Error('x'), { name: 'AbortError' }))).toBe(true);
        expect(isAbort(new Error('Network error'))).toBe(false);
        expect(isAbort(undefined)).toBe(false);
    });
});
