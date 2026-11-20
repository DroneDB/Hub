import { describe, it, expect } from 'vitest';
import { readSource, ruleOf, mediaBlock } from '@/specs/cssSource';

// The overlays of the 3D viewer are CSS: the rules are read from the source
const scss = readSource(__dirname, './UnifiedViewer.scss');

describe('the local coordinates badge of the 3D viewer on a phone (FR-VWR-27)', () => {
    it('is at the top centre from sm up, as it was', () => {
        const badge = ruleOf(scss, '#unified-viewer .local-coords-badge');
        expect(badge).toMatch(/top:\s*var\(--ddb-spacing-md\)/);
        expect(badge).toMatch(/left:\s*50%/);
        expect(badge).toMatch(/transform:\s*translateX\(-50%\)/);
    });

    it('goes below the toolbar row, at the left edge, below sm: no longer over the toolbar and the Layers panel', () => {
        const badge = ruleOf(mediaBlock(scss, 'max-width: 575.98px'), '#unified-viewer .local-coords-badge');
        expect(badge).toMatch(/top:\s*calc\(var\(--ddb-spacing-md\) \+ var\(--unified-toolbar-height\) \+ var\(--ddb-spacing-sm\)\)/);
        expect(badge).toMatch(/left:\s*var\(--ddb-spacing-md\)/);
        expect(badge).toMatch(/transform:\s*none/);
    });

    it('measures the toolbar row from its parts: a 2.25rem button, 0.25rem of padding on each side and the border', () => {
        expect(ruleOf(scss, '#unified-viewer')).toMatch(
            /--unified-toolbar-height:\s*calc\(2\.25rem \+ 2 \* 0\.25rem \+ 2 \* var\(--ddb-border-width\)\)/);
    });
});
