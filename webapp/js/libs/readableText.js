// @ts-check
/**
 * readableText - which text colour reads on a fill: white or the dark text, whichever has the better contrast.
 * One rule for the fills the user chooses (the colours of a report template) and the fills the maps hand out (the
 * colour of an organization).
 */

/** The dark text on a light fill. */
export const DARK_TEXT = '#111827';

/**
 * @param {readonly number[]} channels  red, green and blue, 0-255
 * @returns {'#ffffff' | '#111827'}
 */
export function readableTextOnChannels(channels) {
    const [r, g, b] = channels.map(value => {
        const c = value / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    // The crossover where white and the dark text have the same contrast
    return luminance > 0.179 ? DARK_TEXT : '#ffffff';
}
