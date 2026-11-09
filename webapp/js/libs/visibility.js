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

/**
 * The visibilities a form offers, from the most closed to the most open, each as a select option. The one list
 * of every form that picks a visibility (upload, new dataset, import, settings, photogrammetry).
 * @type {ReadonlyArray<Readonly<{ value: number, label: string }>>}
 */
export const VISIBILITY_OPTIONS = Object.freeze(
    [Visibility.PRIVATE, Visibility.UNLISTED, Visibility.PUBLIC]
        .map(value => Object.freeze({ value, label: LOOKS[value].label })));

/** What a new dataset starts as: private (D-009). */
export const DEFAULT_VISIBILITY = Visibility.PRIVATE;

/** The names the task parameters carry, by visibility. @type {Readonly<Record<number, string>>} */
const NAMES = Object.freeze({
    [Visibility.PRIVATE]: 'PRIVATE',
    [Visibility.UNLISTED]: 'UNLISTED',
    [Visibility.PUBLIC]: 'PUBLIC'
});

/**
 * The name of a visibility as the task parameters carry it ('PRIVATE', 'UNLISTED', 'PUBLIC'); an unknown or missing
 * one is the default.
 * @param {unknown} visibility
 * @returns {string}
 */
export function visibilityName(visibility) {
    return NAMES[/** @type {number} */ (visibility)] ?? NAMES[DEFAULT_VISIBILITY];
}

/** @param {unknown} visibility */
export const visibilityLabel = visibility => visibilityLook(visibility).label;
