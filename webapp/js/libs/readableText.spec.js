/** readableText: white or dark text, whichever has the better contrast on a fill. */
import { describe, it, expect } from 'vitest';
import { DARK_TEXT, readableTextOnChannels } from './readableText';

describe('readableTextOnChannels', () => {
    it('is white on dark fills and the dark text on light ones', () => {
        expect(readableTextOnChannels([0, 0, 0])).toBe('#ffffff');
        expect(readableTextOnChannels([0, 112, 224])).toBe('#ffffff');
        expect(readableTextOnChannels([255, 255, 255])).toBe(DARK_TEXT);
        expect(readableTextOnChannels([253, 216, 53])).toBe(DARK_TEXT);
    });
});
