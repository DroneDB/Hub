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
 */
import { TOAST_LIFE } from './constants';

/** @typedef {'success'|'info'|'warn'|'error'} Severity */
/** @typedef {{ summary?: string, life?: keyof typeof TOAST_LIFE | number }} NotifyOptions */
/** @typedef {{ add: (message: object) => void }} ToastService */

/** @type {Record<Severity, [string, number]>} default summary and duration */
const DEFAULTS = {
    success: ['Success', TOAST_LIFE.short],
    info: ['Info', TOAST_LIFE.short],
    warn: ['Warning', TOAST_LIFE.normal],
    error: ['Error', TOAST_LIFE.normal]
};

/** @type {ToastService|null} */
let service = null;

/** Called once at app start with PrimeVue's toast service. @param {ToastService|null} toastService */
export function setToastService(toastService) {
    service = toastService;
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
        life: typeof options.life === 'string' ? TOAST_LIFE[options.life] : (options.life ?? life)
    };
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

