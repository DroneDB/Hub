import { describe, it, expect } from 'vitest';
import { onScopeDispose } from 'vue';
import { useTestScope } from '@/composables/testScope.fixtures';

const inTestScope = useTestScope();
let stopped = 0;

describe('useTestScope', () => {
    it('runs a composable in a scope that lives through the test', () => {
        const value = inTestScope(() => {
            onScopeDispose(() => { stopped++; });
            return 42;
        });
        expect(value).toBe(42);
        expect(stopped).toBe(0);
    });

    it('stopped the scope of the test before, once', () => {
        expect(stopped).toBe(1);
    });
});
