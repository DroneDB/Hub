// @ts-check
/**
 * orgLogo - what an organization shows where it has no logo image: its initials on its colour. The pure rules
 * of the OrgLogo component, kept apart so they are tested without a component.
 */
import { PRIMARY } from '@/libs/palette';
import { readableTextOnChannels } from '@/libs/readableText';

/**
 * The initials of an organization: the first letters of its first two words (of its name, else of its slug), in
 * capitals. A name of one word gives one letter.
 * @param {{ name?: string|null, slug?: string|null } | null | undefined} org
 * @returns {string}
 */
export function orgInitials(org) {
    const text = String(org?.name || org?.slug || '').trim();
    const words = text.split(/[\s\-_.]+/).filter(word => /[\p{L}\p{N}]/u.test(word));
    return words.slice(0, 2).map(word => (Array.from(word.replace(/^[^\p{L}\p{N}]+/u, ''))[0] ?? '').toUpperCase()).join('');
}

/**
 * The fills of the initials: blues of the brand, teal, green, indigo, purple and slate. None is orange, red or yellow
 * (the Hub has no orange, red is for what destroys and yellow for warnings), which is why the initials do not take the
 * colours of the map's pins, whose palette and fallback have all three. A fill is a colour of its own, not a theme token,
 * so it is the same in both themes and its text is chosen for it (`initialsLook`).
 */
export const ORG_LOGO_FILLS = Object.freeze([
    PRIMARY[500], PRIMARY[700], '#0f766e', '#15803d', '#4338ca', '#7c3aed', '#a21caf', '#475569'
]);

/** A number from a text, the same in every browser. @param {string} text */
function hashOf(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    return hash >>> 0;
}

/**
 * The look of the initials of an organization: the fill its slug gives (the same slug, the same fill) and the text on
 * it, white or the dark text, whichever reads better.
 * @param {string} slug
 * @returns {{ background: string, color: string }}
 */
export function initialsLook(slug) {
    const fill = ORG_LOGO_FILLS[hashOf(String(slug ?? '')) % ORG_LOGO_FILLS.length];
    const channels = [1, 3, 5].map(i => parseInt(fill.slice(i, i + 2), 16));
    return { background: fill, color: readableTextOnChannels(channels) };
}
