/** Where the user types: the keys of a shortcut are left to a field, a select and an editable element. */
import { describe, it, expect } from 'vitest';
import { isTypingTarget } from './typingTarget';

const make = html => { const d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild; };

describe('isTypingTarget', () => {
    it('is true inside a field, a select or an editable element, false elsewhere', () => {
        expect(isTypingTarget(make('<input>'))).toBe(true);
        expect(isTypingTarget(make('<textarea></textarea>'))).toBe(true);
        expect(isTypingTarget(make('<div contenteditable="true"><span>x</span></div>').firstElementChild)).toBe(true);
        expect(isTypingTarget(make('<div contenteditable=""></div>'))).toBe(true);
        expect(isTypingTarget(make('<select></select>'))).toBe(true);
        expect(isTypingTarget(make('<button></button>'))).toBe(false);
        expect(isTypingTarget(make('<div tabindex="0"></div>'))).toBe(false);
        expect(isTypingTarget(null)).toBe(false);
        expect(isTypingTarget(document)).toBe(false);
    });

    it('is true for an element the browser says is editable, whatever marks it so', () => {
        const element = make('<div></div>');
        Object.defineProperty(element, 'isContentEditable', { value: true });
        expect(isTypingTarget(element)).toBe(true);
    });
});
