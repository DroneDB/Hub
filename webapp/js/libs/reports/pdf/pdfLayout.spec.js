import { describe, it, expect } from 'vitest';
import { figureBox, pageLayout } from './pdfLayout';

const portrait = pageLayout({ paper: 'A4', orientation: 'portrait' });
const landscape = pageLayout({ paper: 'A4', orientation: 'landscape' });
const map = (placement, kind = placement === 'item' ? 'item' : 'overview') => ({ type: 'mapSnapshot', kind, placement, frame: [11, 45, 11.01, 45.005] });

describe('the box of a figure', () => {
    it('on a portrait page: the cover map short enough to leave room for the facts, an item map across the page', () => {
        const cover = figureBox(portrait, map('cover'));
        const item = figureBox(portrait, map('item'));
        const overview = figureBox(portrait, map('overview'));
        expect(cover.heightPt).toBeLessThanOrEqual(portrait.contentHeight * 0.34 + 1e-9);
        expect(item.heightPt).toBeLessThanOrEqual(portrait.contentHeight * 0.36 + 1e-9);
        expect(overview.heightPt).toBeGreaterThan(cover.heightPt);
    });

    it('on a landscape page: the cover map and an item map beside the facts, narrower than the page', () => {
        expect(figureBox(landscape, map('cover')).widthPt).toBeLessThanOrEqual(landscape.contentWidth * 0.6 + 1e-9);
        expect(figureBox(landscape, map('item')).widthPt).toBeLessThanOrEqual(landscape.contentWidth * 0.55 + 1e-9);
        expect(figureBox(landscape, { type: 'capture3d' }).widthPt).toBeLessThanOrEqual(landscape.contentWidth * 0.49 + 1e-9);
        // The overview has the page
        expect(figureBox(landscape, map('overview')).heightPt).toBeLessThanOrEqual(landscape.contentHeight * 0.78 + 1e-9);
    });

    it('is rendered at about four pixels a point, within the largest side of a snapshot', () => {
        const box = figureBox(portrait, map('overview'));
        expect(box.widthPx).toBeLessThanOrEqual(2000);
        expect(box.heightPx / box.widthPx).toBeCloseTo(box.heightPt / box.widthPt, 2);
    });

    it('takes the placement of an older model from its kind', () => {
        expect(figureBox(portrait, { type: 'mapSnapshot', kind: 'item', frame: map('item').frame })).toEqual(figureBox(portrait, map('item')));
    });
});
