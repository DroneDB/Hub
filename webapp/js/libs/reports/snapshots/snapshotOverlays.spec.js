/**
 * What a snapshot has drawn over the map: the attribution text of the basemap in the bottom right corner and the legend
 * in the top left corner.
 */
import { describe, it, expect } from 'vitest';
import { attributionText, drawAttribution, drawLegend, overlayFontSize } from './snapshotOverlays';

function recorder() {
    const calls = [];
    const ctx = {
        save() {}, restore() {},
        measureText: text => ({ width: text.length * 10 }),
        fillRect: (...args) => calls.push({ op: 'fillRect', args, fill: ctx.fillStyle }),
        fillText: (...args) => calls.push({ op: 'fillText', args, fill: ctx.fillStyle })
    };
    return { ctx, calls };
}

describe('attributionText', () => {
    it('reads the text of the attributions of a source, which are HTML', () => {
        expect(attributionText({ getAttributions: () => () => ['© OpenStreetMap', '<a href="https://example.org">Example</a> data'] })).toBe('© OpenStreetMap Example data');
        expect(attributionText({ getAttributions: () => ['© Google Maps'] })).toBe('© Google Maps');
    });

    it('does not run markup of an attribution', () => {
        expect(attributionText({ getAttributions: () => ['<img src=x onerror="window.__ran = true">Text'] })).toBe('Text');
        expect(window.__ran).toBeUndefined();
    });

    it('is empty for a source with none', () => {
        expect(attributionText({ getAttributions: () => null })).toBe('');
        expect(attributionText(null)).toBe('');
    });
});

describe('drawAttribution', () => {
    it('writes the text in the bottom right corner on a plate', () => {
        const { ctx, calls } = recorder();
        drawAttribution(ctx, '© OpenStreetMap', 1600, 1000);
        const plate = calls.find(c => c.op === 'fillRect').args;
        const text = calls.find(c => c.op === 'fillText');
        expect(text.args[0]).toBe('© OpenStreetMap');
        // The plate ends at the corner, and the text is inside it
        expect(plate[0] + plate[2]).toBe(1600);
        expect(plate[1] + plate[3]).toBe(1000);
        expect(text.args[1]).toBeGreaterThan(plate[0]);
        expect(text.args[2]).toBeGreaterThan(plate[1]);
        expect(text.args[2]).toBeLessThan(1000);
    });

    it('draws nothing for an empty text, and scales the text with the width', () => {
        const { ctx, calls } = recorder();
        drawAttribution(ctx, '', 1600, 1000);
        expect(calls).toEqual([]);
        expect(overlayFontSize(1600)).toBeGreaterThan(overlayFontSize(640));
    });
});

describe('drawLegend', () => {
    it('draws a swatch in the colour and the name of each entry, top left', () => {
        const { ctx, calls } = recorder();
        drawLegend(ctx, [{ name: 'Crack', colour: '#ff0000' }, { name: 'Leak', colour: '#0000ff' }], 1600);
        expect(calls.filter(c => c.op === 'fillText').map(c => c.args[0])).toEqual(['Crack', 'Leak']);
        expect(calls.filter(c => c.op === 'fillRect' && ['#ff0000', '#0000ff'].includes(c.fill)).map(c => c.fill)).toEqual(['#ff0000', '#0000ff']);
        expect(calls.find(c => c.op === 'fillRect').args[0]).toBeLessThan(40);
    });

    it('draws nothing without entries', () => {
        const { ctx, calls } = recorder();
        drawLegend(ctx, [], 1600);
        expect(calls).toEqual([]);
    });
});
