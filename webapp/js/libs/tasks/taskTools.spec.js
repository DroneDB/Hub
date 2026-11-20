import { describe, it, expect } from 'vitest';
import { isTaskToolOffered } from './taskTools';

describe('which heavy tools are offered', () => {
    const tools = [
        { id: 'build' },
        { id: 'hidden-tool', hidden: true },
        { id: 'disabled-tool', disabled: true }
    ];

    it('offers a tool that is listed', () => {
        expect(isTaskToolOffered(tools, 'build')).toBe(true);
    });

    it('does not offer a tool that is missing, hidden or disabled', () => {
        expect(isTaskToolOffered(tools, 'splat-spz-export')).toBe(false);
        expect(isTaskToolOffered(tools, 'hidden-tool')).toBe(false);
        expect(isTaskToolOffered(tools, 'disabled-tool')).toBe(false);
    });

    it('offers nothing while the catalog is not known', () => {
        expect(isTaskToolOffered(undefined, 'build')).toBe(false);
        expect(isTaskToolOffered(null, 'build')).toBe(false);
        expect(isTaskToolOffered({}, 'build')).toBe(false);
    });
});
