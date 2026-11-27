// @ts-check
/**
 * The look of the PDF: its greys, how a colour of the template or the schema is lightened into the fill of a tile or a
 * badge, and the colour of each tone of a headline figure. One place, so the cover, the summary, the tables and the item
 * pages agree.
 */
import { CLOSED_COLOUR, OVERDUE_COLOUR, tint, textOn } from '@/libs/reports/reportStyling';

export { tint, textOn };

export const INK = '#1f2937';
export const MUTED = '#64748b';
export const RULE = '#cbd5e1';
export const SUBTLE = '#f8fafc';
export const TRACK = '#e2e8f0';
export const WHITE = '#ffffff';
export const INFO_FILL = '#e0f2fe';
// The yellow of a warning, with dark text
export const WARNING_FILL = '#fef08a';

/**
 * The colour of each tone of a headline figure: the neutral one is the primary colour of the template.
 * @param {'neutral' | 'info' | 'alert' | 'done' | string} tone @param {{ primary: string }} colours
 */
export function toneColour(tone, colours) {
    if (tone === 'alert') return OVERDUE_COLOUR;
    if (tone === 'done') return CLOSED_COLOUR;
    if (tone === 'info') return '#0070e0';
    return colours.primary;
}
