// @ts-check
/**
 * storageUsage - how full a storage quota is, written once for the header, the Account page and Admin > Users (D-030,
 * FR-ACC-17): the real percentage (not capped at 100), the severity, the colour of the bar, and the text that says it.
 * The bar is amber from 90 % and red from 100 %; with no quota nothing is full, and no bar is shown.
 */
import { formatBytes, formatNumber } from '@/libs/format';

/** The percentage from which the bar is amber */
export const WARN_AT = 90;
/** The percentage from which the bar is red: the quota is reached */
export const OVER_AT = 100;

/** @typedef {'ok' | 'warn' | 'over'} StorageSeverity */

/**
 * @typedef {object} StorageUsage
 * @property {boolean} unlimited  no quota: there is no bar and no percentage
 * @property {number} used  bytes stored
 * @property {number|null} total  bytes the owner may store; null without a quota
 * @property {number|null} free  bytes left; 0 at or over the quota; null without a quota
 * @property {number|null} percent  used / total, in percent and not capped (130 for 130 %); null without a quota
 * @property {number} barValue  the value of a progress bar: percent, at most 100 (0 without a quota)
 * @property {StorageSeverity} severity  'warn' from 90 %, 'over' from 100 %
 * @property {string} color  the CSS colour of the bar and of its percentage
 * @property {string} usedText  "190.86 MB"
 * @property {string} totalText  "40 MB"; "Unlimited" without a quota
 * @property {string} percentText  "12.5%", "130%"; '' without a quota
 * @property {string} label  one line: "5 MB of 40 MB · 12.5%", "190.86 MB used · Unlimited"
 * @property {string} message  what the user should read near or over the limit; '' below it
 */

const COLORS = Object.freeze({ ok: 'var(--ddb-success)', warn: 'var(--ddb-warning)', over: 'var(--ddb-danger)' });

/**
 * A percentage as text: "12.5%", "130%".
 * @param {number|null|undefined} percent
 */
export function percentOf(percent) {
    return typeof percent === 'number' && Number.isFinite(percent) ? `${formatNumber(percent, 1, { trim: true })}%` : '';
}

/**
 * The severity of a percentage.
 * @param {number|null|undefined} percent
 * @returns {StorageSeverity}
 */
export function severityOf(percent) {
    if (typeof percent !== 'number' || !Number.isFinite(percent)) return 'ok';
    if (percent >= OVER_AT) return 'over';
    return percent >= WARN_AT ? 'warn' : 'ok';
}

/**
 * The state of a storage quota.
 * @param {number|null|undefined} used  bytes stored
 * @param {number|null|undefined} total  bytes allowed; null (or none) for no quota. A quota of 0 is a full one
 * @returns {StorageUsage}
 */
export function storageUsage(used, total) {
    const stored = typeof used === 'number' && Number.isFinite(used) && used > 0 ? used : 0;
    const usedText = formatBytes(stored);
    if (typeof total !== 'number' || !Number.isFinite(total) || total < 0) {
        return {
            unlimited: true, used: stored, total: null, free: null, percent: null, barValue: 0, severity: 'ok', color: COLORS.ok,
            usedText, totalText: 'Unlimited', percentText: '', label: `${usedText} used · Unlimited`, message: ''
        };
    }
    const percent = total > 0 ? (stored / total) * 100 : 100;
    const severity = severityOf(percent);
    const totalText = formatBytes(total);
    const percentText = percentOf(percent);
    const message = severity === 'over'
        ? `Storage quota reached: ${usedText} used of ${totalText}. Uploads to your organizations are refused until you free space or an administrator raises the quota.`
        : severity === 'warn' ? `Storage is almost full: ${percentText} of ${totalText} used.` : '';
    return {
        unlimited: false, used: stored, total, free: Math.max(0, total - stored), percent, barValue: Math.min(percent, 100), severity, color: COLORS[severity],
        usedText, totalText, percentText,
        label: `${usedText} of ${totalText}${stored > 0 ? ` · ${percentText}` : ''}`, message
    };
}
