// @ts-check
/**
 * User notifications. The only caller of PrimeVue's toast service: pages say
 * what happened, this module decides how it looks and how long it stays. One <Toast>
 * host is mounted by the root app; code outside components (map controls, task
 * monitors) uses the same `notify`.
 *
 *   notify.success('Dataset created');
 *   notify.error(err);                                   // an Error shows its message
 *   notify.warn('Quota almost full', { summary: 'Storage', life: 'long' });
 *   notify.success({ summary: 'Camera views saved' });   // summary only
 *   notify.success('File moved', { action: { label: 'Undo', run: undoMove } });   // one action (FR-XC-23)
 *
 * Where a toast shows (FR-XC-09): the one <Toast> host of the root app is top right, below the header. A viewer
 * has controls in the corners, so the toasts of a viewer route go to the `viewer` group, which has its own
 * host: `group: 'viewer'`, or, for every toast that is raised while a viewer route is open, the group the
 * app gives with setToastGroupResolver.
 */
import { TOAST_LIFE } from './constants';

/** @typedef {'success'|'info'|'warn'|'error'} Severity */
/** @typedef {{ label: string, run: () => void }} ToastAction */
/**
 * @typedef {object} NotifyOptions
 * @property {string} [summary]  the title
 * @property {keyof typeof TOAST_LIFE | number} [life]  how long it stays
 * @property {string} [group]  the toast host that shows it (VIEWER_GROUP for a viewer); the app's default otherwise
 * @property {ToastAction} [action]  one button of the toast (FR-XC-23): `run` is called on a click and the toast closes
 */
/** @typedef {{ add: (message: object) => void, remove?: (message: object) => void }} ToastService */

/** The toast group of the viewer routes: its host is in a corner that the viewers do not use (FR-XC-09) */
export const VIEWER_GROUP = 'viewer';

/** @type {Record<Severity, [string, number]>} default summary and duration */
const DEFAULTS = {
    success: ['Success', TOAST_LIFE.short],
    info: ['Info', TOAST_LIFE.short],
    warn: ['Warning', TOAST_LIFE.normal],
    error: ['Error', TOAST_LIFE.normal]
};

/** @type {ToastService|null} */
let service = null;

/** @type {() => (string|undefined)} */
let groupResolver = () => undefined;

/** Called once at app start with PrimeVue's toast service. @param {ToastService|null} toastService */
export function setToastService(toastService) {
    service = toastService;
}

/**
 * The group of the toasts that name none: the app says which one the current route has (App.vue: a viewer route has
 * VIEWER_GROUP). @param {(() => (string|undefined))|null} resolver
 */
export function setToastGroupResolver(resolver) {
    groupResolver = resolver ?? (() => undefined);
}

/**
 * Runs the action of a toast and closes the toast (the click handler of the shared toast template). The action runs once:
 * a second click while the toast closes (a double click, a slow close) does nothing (`data.done`).
 * @param {{ data?: { action?: ToastAction, done?: boolean } }} message
 */
export function runToastAction(message) {
    const data = message?.data;
    const action = data?.action;
    if (!action || data.done) return;
    data.done = true;
    try {
        action.run();
    } finally {
        service?.remove?.(message);
    }
}

/** @param {unknown} detail @returns {string|undefined} */
function toText(detail) {
    if (detail === null || detail === undefined || detail === '') return undefined;
    if (detail instanceof Error) return detail.message;
    return String(detail);
}

/**
 * @param {Severity} severity
 * @param {unknown} [detail]  text, an Error, or the options when there is no detail
 * @param {NotifyOptions} [options]
 */
function show(severity, detail, options = {}) {
    if (detail && typeof detail === 'object' && !(detail instanceof Error)) {
        options = /** @type {NotifyOptions} */ (detail);
        detail = undefined;
    }
    const [summary, life] = DEFAULTS[severity];
    const message = {
        severity,
        summary: options.summary ?? summary,
        detail: toText(detail),
        // A toast with an action stays long enough to reach it
        life: typeof options.life === 'string' ? TOAST_LIFE[options.life] : (options.life ?? (options.action ? Math.max(life, TOAST_LIFE.normal) : life))
    };
    const group = options.group ?? groupResolver();
    if (group) Object.assign(message, { group });
    if (options.action) Object.assign(message, { data: { action: options.action } });
    if (service) service.add(message);
    else console.warn(`[notify] ${message.summary}: ${message.detail ?? ''}`);
}

export const notify = {
    /** @param {unknown} [detail] @param {NotifyOptions} [options] */
    success: (detail, options) => show('success', detail, options),
    /** @param {unknown} [detail] @param {NotifyOptions} [options] */
    info: (detail, options) => show('info', detail, options),
    /** @param {unknown} [detail] @param {NotifyOptions} [options] */
    warn: (detail, options) => show('warn', detail, options),
    /** @param {unknown} [detail] @param {NotifyOptions} [options] */
    error: (detail, options) => show('error', detail, options)
};

