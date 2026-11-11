import { describe, it, expect, afterEach, vi } from 'vitest';
import { resolveLengthPx, pxToPercent, percentToPx, capPaneWidth } from './panelSize';

afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('resolveLengthPx', () => {
    it('reads px as it is and rem from the root font size', () => {
        expect(resolveLengthPx('360px', null)).toBe(360);
        expect(resolveLengthPx('22.5rem', null)).toBe(360); // the jsdom root font is 16px
        document.documentElement.style.fontSize = '20px';
        expect(resolveLengthPx('10rem', null)).toBe(200);
        document.documentElement.style.fontSize = '';
    });

    it('lays out a CSS expression in a hidden probe that it removes again', () => {
        const host = document.body.appendChild(document.createElement('div'));
        let probe;
        vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
            probe = this;
            return { width: 345.6 };
        });
        expect(resolveLengthPx('var(--ddb-panel-tree-width)', host)).toBe(345.6);
        expect(probe.style.width).toBe('var(--ddb-panel-tree-width)');
        expect(probe.getAttribute('aria-hidden')).toBe('true');
        expect(host.children).toHaveLength(0);
    });

    it('is null for nothing, zero, a value it cannot lay out or a missing host', () => {
        const host = document.body.appendChild(document.createElement('div'));
        expect(resolveLengthPx('', host)).toBeNull();
        expect(resolveLengthPx('0px', host)).toBeNull();
        expect(resolveLengthPx('var(--x)', null)).toBeNull();
        expect(resolveLengthPx('var(--x)', host)).toBeNull(); // jsdom has no layout: width 0
    });
});

describe('pxToPercent and percentToPx', () => {
    it('converts a width to the share of its container', () => {
        expect(pxToPercent(360, 3840, 2)).toBeCloseTo(9.375, 6);
        expect(pxToPercent(360, 1800, 2)).toBe(20);
        expect(percentToPx(20, 1800)).toBe(360);
    });

    it('keeps a pane inside its limits and has no answer without a container', () => {
        expect(pxToPercent(10, 3000, 2)).toBe(2);
        expect(pxToPercent(2990, 3000, 2)).toBe(98);
        expect(pxToPercent(360, 0, 2)).toBeNull();
        expect(pxToPercent(Number.NaN, 1000, 2)).toBeNull();
    });
});

describe('capPaneWidth', () => {
    it('leaves a width that fits, caps one that does not at container - reserve, and never goes under the minimum pane', () => {
        expect(capPaneWidth(360, 1920, 320, 2)).toBe(360);
        expect(capPaneWidth(1000, 960, 320, 2)).toBe(640);
        expect(capPaneWidth(1000, 300, 320, 2)).toBe(6); // 2% of 300
        expect(capPaneWidth(1000, 0, 320, 2)).toBe(1000); // not measured yet
    });
});
