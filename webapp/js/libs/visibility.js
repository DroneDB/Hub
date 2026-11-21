// @ts-check
/**
 * How a visibility shows as a tag: its label, severity and icon. Private is the usual state of a
 * dataset or organization, not a warning: its tag is neutral, so the colours of a list stay for
 * what needs attention (red is the delete button next to it).
 */
import { Visibility } from 'ddb';
import { escapeHtml } from '@/libs/sanitize';

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

/** What each visibility means for the data, one sentence each. @type {Readonly<Record<number, string>>} */
const DESCRIPTIONS = Object.freeze({
    [Visibility.PRIVATE]: 'Only members of the organization can see and download the data.',
    [Visibility.UNLISTED]: 'Anyone with the link can see and download the data, but it is not listed.',
    [Visibility.PUBLIC]: 'Listed and discoverable: anyone can see and download the data.'
});

/**
 * What a visibility means for the data, as one plain sentence: the same words in the Settings window, the
 * visibility menu of the header and the question asked before a change. An unknown or missing one is private.
 * @param {unknown} visibility
 * @returns {string}
 */
export function visibilityDescription(visibility) {
    return DESCRIPTIONS[/** @type {number} */ (visibility)] ?? DESCRIPTIONS[DEFAULT_VISIBILITY];
}

/**
 * The question asked before the visibility of a dataset changes, as useConfirm() options. Every change asks, in
 * either direction: it changes who can open every file of the dataset. The body names the dataset (HTML-escaped:
 * the name comes from the user), the visibility it has and the one it gets, and what that means.
 * @param {{ name: string, from: unknown, to: unknown, note?: string }} options
 *   name  the dataset as the user sees it (its display name, else its slug)
 *   note  one more plain-text sentence, after the meaning (the Share window says that every file is shared)
 * @returns {{ title: string, message: string, confirmText: string, cancelText: string }}
 */
export function visibilityChangeConfirmation({ name, from, to, note = '' }) {
    const target = visibilityLabel(to);
    const message = `This changes the visibility of the dataset <strong>${escapeHtml(name)}</strong> ` +
        `from ${escapeHtml(visibilityLabel(from))} to ${escapeHtml(target)}. ${escapeHtml(visibilityDescription(to))}` +
        (note ? ` ${escapeHtml(note)}` : '');
    return { title: `Make the dataset ${target}?`, message, confirmText: `Make ${target}`, cancelText: 'Cancel' };
}
