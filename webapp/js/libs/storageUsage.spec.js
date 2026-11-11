import { describe, it, expect } from 'vitest';
import { storageUsage, severityOf, percentOf, WARN_AT, OVER_AT } from './storageUsage';

const MB = 1024 * 1024;

describe('storageUsage (D-030)', () => {
    it('is amber from 90 % and red from 100 %', () => {
        expect(WARN_AT).toBe(90);
        expect(OVER_AT).toBe(100);
        const at = percent => storageUsage(percent * MB, 100 * MB);
        expect(at(89).severity).toBe('ok');
        expect(at(89).color).toBe('var(--ddb-success)');
        expect(at(90).severity).toBe('warn');
        expect(at(90).color).toBe('var(--ddb-warning)');
        expect(at(99.9).severity).toBe('warn');
        expect(at(100).severity).toBe('over');
        expect(at(100).color).toBe('var(--ddb-danger)');
        expect(at(130).severity).toBe('over');
    });

    it('keeps the real percentage over 100 and caps only the value of the bar', () => {
        const usage = storageUsage(52 * MB, 40 * MB);
        expect(usage.percent).toBe(130);
        expect(usage.percentText).toBe('130%');
        expect(usage.barValue).toBe(100);
        expect(usage.label).toBe('52 MB of 40 MB · 130%');
        expect(usage.free).toBe(0);
        expect(storageUsage(10 * MB, 40 * MB).free).toBe(30 * MB);
        expect(usage.message).toBe('Storage quota reached: 52 MB used of 40 MB. Uploads to your organizations are refused until you free space or an administrator raises the quota.');
    });

    it('says a near-full quota in a message, and a comfortable one in none', () => {
        expect(storageUsage(36 * MB, 40 * MB).message).toBe('Storage is almost full: 90% of 40 MB used.');
        expect(storageUsage(10 * MB, 40 * MB).message).toBe('');
        expect(storageUsage(10 * MB, 40 * MB).percentText).toBe('25%');
    });

    it('has no percentage and no bar without a quota (unlimited)', () => {
        for (const total of [null, undefined, NaN]) {
            const usage = storageUsage(190.86 * MB, total);
            expect(usage.unlimited).toBe(true);
            expect(usage.percent).toBeNull();
            expect(usage.barValue).toBe(0);
            expect(usage.severity).toBe('ok');
            expect(usage.percentText).toBe('');
            expect(usage.label).toBe('190.86 MB used · Unlimited');
        }
        expect(storageUsage(0, null).label).toBe('0 B used · Unlimited');
    });

    it('writes a quota with nothing used as "0 B of 40 MB"', () => {
        const usage = storageUsage(0, 40 * MB);
        expect(usage.unlimited).toBe(false);
        expect(usage.percent).toBe(0);
        expect(usage.label).toBe('0 B of 40 MB');
        expect(usage.severity).toBe('ok');
    });

    it('treats a quota of 0 as full (the server refuses every upload)', () => {
        const usage = storageUsage(0, 0);
        expect(usage.unlimited).toBe(false);
        expect(usage.severity).toBe('over');
        expect(usage.barValue).toBe(100);
    });

    it('reads a missing or negative used size as 0', () => {
        expect(storageUsage(undefined, 40 * MB).used).toBe(0);
        expect(storageUsage(-5, 40 * MB).percent).toBe(0);
    });

    it('has the severity and the percentage text on their own', () => {
        expect(severityOf(null)).toBe('ok');
        expect(severityOf(89.99)).toBe('ok');
        expect(severityOf(90)).toBe('warn');
        expect(severityOf(100)).toBe('over');
        expect(percentOf(12.5)).toBe('12.5%');
        expect(percentOf(null)).toBe('');
    });
});
