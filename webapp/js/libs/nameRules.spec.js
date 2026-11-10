/**
 * nameRules: the input rules come from /sys/features (FR-XC-12); the Hub runs the Registry's own
 * test cases (__vectors__/input-rules.json, a copy of Registry.Web.UnitTest/Rules/input-rule-vectors.json)
 * against them, with the published rules and with the built-in copy an older Registry gets.
 */
import { describe, it, expect, afterEach } from 'vitest';
import reg from '@/libs/api/sharedRegistry';
import vectors from './__vectors__/input-rules.json';
import {
    FALLBACK_INPUT_RULES, inputRule, isEmail, emailProblem, emailDescription, isEntryName, nameClashMessage, namesClash,
    freeName, isCronDisableWord, isCronMacro, cronDisableWords, cronFieldCount, hasLatinLetterOrDigit, latinNameProblem,
    isName, nameDescription, userNameProblem, roleNameProblem, invalidNameMessage
} from './nameRules';

const serve = features => { reg.features.values = features; };
afterEach(() => reg.features.clear());

// What the Registry publishes is what the Hub has built in (a copy of the golden sys-features.json)
const PUBLISHED = JSON.parse(JSON.stringify(FALLBACK_INPUT_RULES));

describe.each([
    ['published by the Registry', () => serve({ inputRules: PUBLISHED })],
    ['from an older Registry (built-in rules)', () => serve({})]
])('the Registry test cases, %s', (_, setup) => {
    it('e-mail: the pre-check answers as the vectors say', () => {
        setup();
        expect(vectors.email.map(v => [v.value, isEmail(v.value)])).toEqual(vectors.email.map(v => [v.value, v.precheck]));
    });

    it('user and role names (D-007): the pattern answers as the Registry does', () => {
        setup();
        expect(vectors.name.accept.filter(n => !isName(n))).toEqual([]);
        expect(vectors.name.reject.filter(n => isName(n))).toEqual([]);
    });

    it('entry names at the dataset root', () => {
        setup();
        const cases = vectors.entryName;
        expect(cases.map(v => [v.name, isEntryName(v.name, { atRoot: true })])).toEqual(cases.map(v => [v.name, v.precheck]));
    });

    it('entry names in a folder', () => {
        setup();
        const cases = vectors.entryNameInFolder;
        expect(cases.map(v => [v.name, isEntryName(v.name)])).toEqual(cases.map(v => [v.name, v.precheck]));
    });

    it('a name with a Latin letter or digit once its accents are dropped', () => {
        setup();
        expect(vectors.latinName.accept.filter(n => !hasLatinLetterOrDigit(n))).toEqual([]);
        expect(vectors.latinName.reject.filter(n => hasLatinLetterOrDigit(n))).toEqual([]);
    });
});

describe('reading the rules', () => {
    it('takes each field the server sends, and the built-in value of a field it leaves out', () => {
        serve({ inputRules: { email: { pattern: '^x@y$', description: 'x at y', message: null } } });
        expect(isEmail('x@y')).toBe(true);
        expect(isEmail('jane@example.com')).toBe(false);
        expect(emailDescription()).toBe('x at y');
        // message null: the built-in text
        expect(emailProblem('jane')).toBe(FALLBACK_INPUT_RULES.email.message);
        // a rule it does not send
        expect(inputRule('cron')).toEqual(FALLBACK_INPUT_RULES.cron);
    });

    it('follows the reserved names the server publishes', () => {
        serve({ inputRules: { entryName: { reservedNames: ['.ddb', 'thumbs.db'], rootReservedNames: ['.meta'] } } });
        expect(isEntryName('THUMBS.DB')).toBe(false);
        expect(isEntryName('.meta', { atRoot: true })).toBe(false);
        expect(isEntryName('.uploads', { atRoot: true })).toBe(true);
    });

    it('works with a registry that has no features (a component test that mocks it)', () => {
        const features = reg.features;
        try {
            // @ts-ignore
            reg.features = undefined;
            expect(isEmail('jane@example.com')).toBe(true);
        } finally {
            reg.features = features;
        }
    });
});

describe('user and role names (FR-ADM-01, FR-ADM-02)', () => {
    const RULE = '1 to 127 characters: lowercase letters (a–z) and digits (0–9)';

    it('say the rule at the field in the words of the Registry 400, before submit', () => {
        expect(nameDescription()).toBe(RULE);
        expect(invalidNameMessage('User name')).toBe(`User name is invalid: use ${RULE}`);
        for (const name of ['t-admin-user', 'TADMIN', 'bad name!', 'a.b']) {
            expect(userNameProblem(name)).toBe(`User name is invalid: use ${RULE}`);
        }
        for (const name of ['a/b', 'Bad Role!', 'a-b']) {
            expect(roleNameProblem(name)).toBe(`Role name is invalid: use ${RULE}`);
        }
    });

    it('require a name, and trim the spaces around it as the forms do', () => {
        expect(userNameProblem('')).toBe('Enter a username.');
        expect(userNameProblem('   ')).toBe('Enter a username.');
        expect(userNameProblem(undefined)).toBe('Enter a username.');
        expect(roleNameProblem(' ')).toBe('Enter a role name.');
        expect(userNameProblem(' bob ')).toBeNull();
        expect(roleNameProblem('editor2')).toBeNull();
    });

    it('stop at 127 characters', () => {
        expect(userNameProblem('a'.repeat(127))).toBeNull();
        expect(userNameProblem('a'.repeat(128))).toBe(`User name is invalid: use ${RULE}`);
    });

    it('follow the rule the server publishes, with the built-in text for a field it leaves out', () => {
        serve({ inputRules: { name: { pattern: '^[a-z]{1,5}$', description: 'up to 5 letters' } } });
        expect(userNameProblem('abc')).toBeNull();
        expect(userNameProblem('abc1')).toBe('User name is invalid: use up to 5 letters');
        expect(isName('abcdef')).toBe(false);
    });
});

describe('the rule texts', () => {
    it('e-mail: blank is fine in an optional field, another value gets the published message', () => {
        expect(emailProblem('')).toBeNull();
        expect(emailProblem('   ')).toBeNull();
        expect(emailProblem('', { optional: false })).toBe('The e-mail address is not valid: enter one address, such as name@example.com');
        expect(emailProblem('jane')).toBe('The e-mail address is not valid: enter one address, such as name@example.com');
        expect(emailProblem(' jane@example.com ')).toBeNull();
    });

    it('"already exists": one message, names compared without regard to case', () => {
        expect(nameClashMessage('README.md')).toBe("A file or folder named 'README.md' already exists in this folder");
        expect(nameClashMessage('$&.txt')).toBe("A file or folder named '$&.txt' already exists in this folder");
        expect(namesClash('Readme.MD', 'README.md')).toBe(true);
        expect(namesClash('a.txt', 'b.txt')).toBe(false);
        serve({ inputRules: { nameClash: { caseInsensitive: false } } });
        expect(namesClash('Readme.MD', 'README.md')).toBe(false);
    });

    it('cron: the fields of an expression, from the rule (an older Registry: 5 or 6)', () => {
        expect(cronFieldCount()).toEqual({ min: 5, max: 6 });
        serve({ inputRules: { cron: { disableWords: ['off'] } } });
        expect(cronFieldCount()).toEqual({ min: 5, max: 6 });
        serve({ inputRules: { cron: { minFields: 5, maxFields: 7 } } });
        expect(cronFieldCount()).toEqual({ min: 5, max: 7 });
    });

    it('cron: the words that switch a job off, in any case', () => {
        expect(cronDisableWords()).toEqual(['disabled', 'off', 'none']);
        expect(['off', ' NONE ', 'Disabled'].map(isCronDisableWord)).toEqual([true, true, true]);
        expect(['', '0 0 * * *', 'never'].map(isCronDisableWord)).toEqual([false, false, false]);
    });

    it('cron: the macros that are a whole value, in any case (an older Registry: the nine of Hangfire)', () => {
        expect(['@daily', ' @HOURLY ', '@every_second', '@yearly', '@annually', '@monthly', '@weekly', '@midnight', '@every_minute'].map(isCronMacro)).toEqual(Array(9).fill(true));
        expect(['', '@reboot', '@daily extra', 'daily', '0 0 * * *', null, undefined].map(isCronMacro)).toEqual(Array(7).fill(false));
        serve({ inputRules: { cron: { macros: ['@soon'] } } });
        expect(isCronMacro('@SOON')).toBe(true);
        expect(isCronMacro('@daily')).toBe(false);
    });

    it('Latin letter: the message with a slug field, the one without, and a slug that holds a letter', () => {
        expect(latinNameProblem('Москва')).toBe('Use at least one Latin letter (a–z) or digit in the name, or enter a slug');
        expect(latinNameProblem('Москва', { withSlugField: false })).toBe('Use at least one Latin letter (a–z) or digit');
        expect(latinNameProblem('Москва', { slug: 'moskva' })).toBeNull();
        expect(latinNameProblem('Équipe Été')).toBeNull();
    });
});

describe('freeName (FR-XC-07)', () => {
    it('keeps a name no sibling has', () => {
        expect(freeName('merged.tif', ['a.tif', 'b.tif'])).toBe('merged.tif');
        expect(freeName('merged.tif', [])).toBe('merged.tif');
    });

    it('puts the lowest free number of 2 or more before the last extension', () => {
        expect(freeName('merged.tif', ['merged.tif'])).toBe('merged (2).tif');
        expect(freeName('merged.tif', ['merged.tif', 'merged (2).tif'])).toBe('merged (3).tif');
        expect(freeName('IMG_0180.b.tif', ['IMG_0180.b.tif'])).toBe('IMG_0180.b (2).tif');
        expect(freeName('data.tar.gz', ['data.tar.gz'])).toBe('data.tar (2).gz');
    });

    it('takes the first gap', () => {
        expect(freeName('a.txt', ['a.txt', 'a (2).txt', 'a (4).txt'])).toBe('a (3).txt');
        expect(freeName('a.txt', ['a.txt', 'a (3).txt'])).toBe('a (2).txt');
    });

    it('adds the number at the end of a name without an extension (a leading dot is not one)', () => {
        expect(freeName('notes', ['notes'])).toBe('notes (2)');
        expect(freeName('.env', ['.env'])).toBe('.env (2)');
        expect(freeName('notes', ['notes', 'notes (2)'])).toBe('notes (3)');
    });

    it('compares names without regard to case (D-040), and keeps the case asked for', () => {
        expect(freeName('Merged.TIF', ['merged.tif'])).toBe('Merged (2).TIF');
        expect(freeName('merged.tif', ['MERGED.TIF', 'Merged (2).tif'])).toBe('merged (3).tif');
        serve({ inputRules: { nameClash: { caseInsensitive: false } } });
        expect(freeName('Merged.TIF', ['merged.tif'])).toBe('Merged.TIF');
    });

    it('ignores siblings that are not names', () => {
        expect(freeName('a.tif', [null, undefined, 'a.tif'])).toBe('a (2).tif');
    });
});
