// @ts-check
/**
 * How a visibility shows as a tag: its label, severity and icon. Private is the usual state of a
 * dataset or organization, not a warning: its tag is neutral, so the colours of a list stay for
 * what needs attention (red is the delete button next to it).
 */
import { Visibility } from 'ddb';

/** @typedef {{ label: string, severity: 'success'|'info'|'secondary', icon: string }} VisibilityLook */

/** @type {Readonly<Record<number, VisibilityLook>>} */
const LOOKS = Object.freeze({
    [Visibility.PUBLIC]: { label: 'Public', severity: 'success', icon: 'fa-solid fa-globe' },
    [Visibility.UNLISTED]: { label: 'Unlisted', severity: 'info', icon: 'fa-solid fa-unlock' },
    [Visibility.PRIVATE]: { label: 'Private', severity: 'secondary', icon: 'fa-solid fa-lock' }
});

/**
 * The look of a visibility; an unknown or missing one is private, as the server treats it.
 * @param {unknown} visibility
 * @returns {VisibilityLook}
 */
export function visibilityLook(visibility) {
    return LOOKS[/** @type {number} */ (visibility)] ?? LOOKS[Visibility.PRIVATE];
}

/** @param {unknown} visibility */
export const visibilityLabel = visibility => visibilityLook(visibility).label;
