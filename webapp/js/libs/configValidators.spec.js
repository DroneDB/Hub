/**
 * configValidators (FR-ADM-06, FR-ADM-13): one validator per field type of the Configuration page.
 * The timespan cases are the shared Registry cases (__vectors__/input-rules.json), which the Registry
 * unit tests run against .NET `TimeSpan.TryParse`.
 */
import { describe, it, expect, afterEach } from 'vitest';
import reg from '@/libs/api/sharedRegistry';
import vectors from './__vectors__/input-rules.json';
import {
    timespanProblem, cronProblem, jsonProblem, fieldProblem, fieldPlaceholder, fieldHint, VALIDATED_TYPES
} from './configValidators';

afterEach(() => reg.features.clear());

describe('cronProblem', () => {
    it('accepts blank (the default), the words that switch the job off in any case, and 5 or 6 fields', () => {
        for (const value of ['', '   ', null, undefined, 'off', 'none', 'disabled', ' OFF ', 'None', '0 0 * * *', '*/5 * * * *', '0 0 0 * * *', '  0   3 * *  1 ', '@daily', '@HOURLY', ' @Midnight ', '@yearly', '@annually', '@monthly', '@weekly', '@every_minute', '@every_second']) {
            expect(cronProblem(value), String(value)).toBeNull();
        }
    });

    it('refuses anything else, and says the rule', () => {
        const message = 'Not a valid cron expression: use 5 or 6 fields separated by spaces (such as 0 0 * * *), a macro such as @daily, or disabled, off, none to turn the job off.';
        for (const value of ['every day please', '0 0 * *', '0 0 * * * * *', 'never', '0', '@reboot', '@daily extra', 'daily', '@']) {
            expect(cronProblem(value), value).toBe(message);
        }
    });

    it('a macro is the whole value: the macros the server publishes, in any case', () => {
        reg.features.values = { inputRules: { cron: { macros: ['@soon'] } } };
        expect(cronProblem('@SOON')).toBeNull();
        expect(cronProblem('@daily')).not.toBeNull();
        expect(cronProblem('0 0 * * *')).toBeNull();
    });

    it('follows the rule the server publishes', () => {
        reg.features.values = { inputRules: { cron: { disableWords: ['pause'], minFields: 5, maxFields: 7 } } };
        expect(cronProblem('pause')).toBeNull();
        expect(cronProblem('off')).toContain('use 5 or 7 fields');
        expect(cronProblem('0 0 * * * * *')).toBeNull();
    });
});

describe('timespanProblem', () => {
    it('answers as the Registry test cases say (what .NET TimeSpan.Parse accepts)', () => {
        const answers = vectors.timespan.map(c => [c.value, timespanProblem(c.value) === null]);
        expect(answers).toEqual(vectors.timespan.map(c => [c.value, c.precheck]));
    });

    it('hours at most 23 in hh:mm; "24:00:00" and above are days:hours:minutes, as .NET reads them', () => {
        const answer = value => timespanProblem(value) === null;
        // TimeSpan.TryParse (Registry test Timespan_TheThreeNumberForms...): 24:00 and 48:00 fail, 24:00:00 is 24 days
        expect(['24:00', '48:00', '100:00', '1.24:00', '24:30:00', '24:60:00', '24:00:00.5', '1:24:00:00'].map(answer)).toEqual(Array(8).fill(false));
        expect(['23:59', '24:00:00', '25:00:00', '24:00:01', '10675199:02:48', '1.00:00', '00:00:.5'].map(answer)).toEqual(Array(7).fill(true));
    });

    it('the hint and the message say the hours go up to 23, and that 24:00:00 is 24 days', () => {
        expect(fieldHint({ fieldType: 'timespan' })).toContain('[days.]hh:mm[:ss] with hours up to 23');
        expect(fieldHint({ fieldType: 'timespan' })).toContain('not 24:00:00 (that is 24 days)');
        expect(timespanProblem('24:00')).toContain('[days.]hh:mm[:ss] with hours up to 23');
    });

    it('accepts blank (the default), "1.02:03:04" and "00:30:00"; refuses "not-a-time"', () => {
        expect(['', '  ', null, undefined].map(timespanProblem)).toEqual([null, null, null, null]);
        expect(timespanProblem('1.02:03:04')).toBeNull();
        expect(timespanProblem('00:30:00')).toBeNull();
        expect(timespanProblem('not-a-time')).toBe('Not a valid time span: use days (such as 2) or [days.]hh:mm[:ss] with hours up to 23 (such as 00:30:00 for 30 minutes).');
    });
});

describe('jsonProblem', () => {
    it('accepts blank and JSON of any kind', () => {
        for (const value of ['', ' ', null, '{}', '[]', '{"a": [1, 2]}', '"text"', '12', 'null', ' { "Name": "x" } ']) {
            expect(jsonProblem(value), String(value)).toBeNull();
        }
    });

    it('refuses what JSON.parse refuses, with its reason', () => {
        for (const value of ['{ not json', '{"a": }', "{'a': 1}", '[1, 2', 'undefined']) {
            expect(jsonProblem(value), value).toMatch(/^Not valid JSON/);
        }
    });
});

describe('by field type', () => {
    it('runs the validator of the type, and none for the other types', () => {
        expect(fieldProblem({ fieldType: 'cron' }, 'x')).toMatch(/^Not a valid cron/);
        expect(fieldProblem({ fieldType: 'timespan' }, 'x')).toMatch(/^Not a valid time span/);
        expect(fieldProblem({ fieldType: 'json' }, '{')).toMatch(/^Not valid JSON/);
        for (const fieldType of ['text', 'number', 'bool', 'enum', 'array', 'password', 'info']) {
            expect(fieldProblem({ fieldType }, 'x'), fieldType).toBeNull();
        }
        expect(VALIDATED_TYPES).toEqual(['timespan', 'cron', 'json']);
    });

    it('placeholder: the default the field takes, never a value that looks real', () => {
        expect(fieldPlaceholder({ fieldType: 'cron', defaultValue: '0 0 * * *' })).toBe('Default: 0 0 * * *');
        expect(fieldPlaceholder({ fieldType: 'timespan', defaultValue: '00:30:00' })).toBe('Default: 00:30:00');
        expect(fieldPlaceholder({ fieldType: 'cron', defaultValue: null })).toBe('Not set');
        expect(fieldPlaceholder({ fieldType: 'timespan', defaultValue: '' })).toBe('Not set');
        expect(fieldPlaceholder({ fieldType: 'text', defaultValue: 'x' })).toBeUndefined();
    });

    it('hint: the rule the validator checks, with the words that switch a cron job off', () => {
        expect(fieldHint({ fieldType: 'timespan' })).toBe('Days, or [days.]hh:mm[:ss] with hours up to 23. For example 00:30:00 is 30 minutes, 1.12:00:00 is 1 day and 12 hours. A number alone is days: for one day write 1 or 1.00:00:00, not 24:00:00 (that is 24 days).');
        expect(fieldHint({ fieldType: 'cron' })).toBe('Cron expression of 5 or 6 fields, or a macro such as @daily or @hourly. Empty takes the default; disabled, off, none (any case) turns the job off.');
        expect(fieldHint({ fieldType: 'json' })).toBeUndefined();
    });
});
