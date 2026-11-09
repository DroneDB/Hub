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
    isCronDisableWord, cronDisableWords, hasLatinLetterOrDigit, latinNameProblem
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

    it('cron: the words that switch a job off, in any case', () => {
        expect(cronDisableWords()).toEqual(['disabled', 'off', 'none']);
        expect(['off', ' NONE ', 'Disabled'].map(isCronDisableWord)).toEqual([true, true, true]);
        expect(['', '0 0 * * *', 'never'].map(isCronDisableWord)).toEqual([false, false, false]);
    });

    it('Latin letter: the message with a slug field, the one without, and a slug that holds a letter', () => {
        expect(latinNameProblem('Москва')).toBe('Use at least one Latin letter (a–z) or digit in the name, or enter a slug');
        expect(latinNameProblem('Москва', { withSlugField: false })).toBe('Use at least one Latin letter (a–z) or digit');
        expect(latinNameProblem('Москва', { slug: 'moskva' })).toBeNull();
        expect(latinNameProblem('Équipe Été')).toBeNull();
    });
});
