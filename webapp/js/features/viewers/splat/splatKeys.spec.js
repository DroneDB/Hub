import { describe, it, expect } from 'vitest';
import { keyAction, cameraIndexOfCode, consumesKey } from './splatKeys';

const open = { loaded: true, dialogOpen: false, cameraCount: 3 };
const key = (code, extra = {}) => ({ code, ...extra });
const inside = (tag, attrs = {}) => {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    const child = document.createElement('button');
    el.appendChild(child);
    document.body.appendChild(el);
    return { el, child };
};

describe('camera keys', () => {
    it('number the cameras from 1: Digit1 is the camera labelled 1, index 0', () => {
        expect(cameraIndexOfCode('Digit1')).toBe(0);
        expect(cameraIndexOfCode('Digit9')).toBe(8);
        expect(cameraIndexOfCode('Numpad3')).toBe(2);
        expect(cameraIndexOfCode('Digit0')).toBeNull();
        expect(cameraIndexOfCode('KeyA')).toBeNull();
    });

    it('fly to the camera of that number', () => {
        expect(keyAction(key('Digit1'), open)).toEqual({ type: 'camera', index: 0 });
        expect(keyAction(key('Digit3'), open)).toEqual({ type: 'camera', index: 2 });
    });

    it('do nothing for a number with no camera, and the zero key', () => {
        expect(keyAction(key('Digit4'), open)).toBeNull();
        expect(keyAction(key('Digit0'), { ...open, cameraCount: 10 })).toBeNull();
        expect(keyAction(key('Digit1'), { ...open, cameraCount: 0 })).toBeNull();
    });
});

describe('stepping and the tour', () => {
    it('use the key codes, so the layout and Shift do not matter', () => {
        expect(keyAction(key('Minus', { key: '-' }), open)).toEqual({ type: 'step', step: -1 });
        expect(keyAction(key('Equal', { key: '=' }), open)).toEqual({ type: 'step', step: 1 });
        // "+" is Shift and "=" on a US keyboard, "ß" or "?" elsewhere: the key is what counts
        expect(keyAction(key('Equal', { key: '+', shiftKey: true }), open)).toEqual({ type: 'step', step: 1 });
        expect(keyAction(key('Minus', { key: 'ß' }), open)).toEqual({ type: 'step', step: -1 });
        expect(keyAction(key('NumpadAdd'), open)).toEqual({ type: 'step', step: 1 });
        expect(keyAction(key('NumpadSubtract'), open)).toEqual({ type: 'step', step: -1 });
    });

    it('do not take a character that is on another key', () => {
        expect(keyAction(key('Slash', { key: '-' }), open)).toBeNull();
    });

    it('P resumes the tour', () => {
        expect(keyAction(key('KeyP'), open)).toEqual({ type: 'tour' });
    });
});

describe('movement', () => {
    it('is the movement keys, and Shift for the speed', () => {
        for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
            expect(keyAction(key(code), open)).toEqual({ type: 'move', code });
        }
        expect(keyAction(key('ShiftLeft'), open)).toEqual({ type: 'speed', code: 'ShiftLeft' });
    });

    it('consumes every key but the speed key', () => {
        expect(consumesKey(keyAction(key('KeyW'), open))).toBe(true);
        expect(consumesKey(keyAction(key('Digit1'), open))).toBe(true);
        expect(consumesKey(keyAction(key('ShiftRight'), open))).toBe(false);
        expect(consumesKey(null)).toBe(false);
    });
});

describe('gates', () => {
    it('no key works while a dialog is open, or before the splat is shown', () => {
        for (const code of ['KeyW', 'ArrowLeft', 'Digit1', 'Minus', 'Equal', 'KeyP', 'ShiftLeft']) {
            expect(keyAction(key(code), { ...open, dialogOpen: true })).toBeNull();
            expect(keyAction(key(code), { ...open, loaded: false })).toBeNull();
        }
    });

    it('leaves the browser\'s shortcuts alone', () => {
        for (const mod of ['ctrlKey', 'metaKey', 'altKey']) {
            expect(keyAction(key('KeyW', { [mod]: true }), open)).toBeNull();
        }
    });

    it('leaves typing and choosing to the page, whatever the key', () => {
        for (const tag of ['input', 'textarea', 'select']) {
            const target = document.createElement(tag);
            document.body.appendChild(target);
            for (const code of ['KeyW', 'ArrowLeft', 'Digit1', 'Minus', 'KeyP']) {
                expect(keyAction(key(code, { target }), open)).toBeNull();
            }
        }
        const { child } = inside('select');
        expect(keyAction(key('ArrowDown', { target: child }), open)).toBeNull();
        const editable = document.createElement('div');
        editable.contentEditable = 'true';
        Object.defineProperty(editable, 'isContentEditable', { value: true });
        expect(keyAction(key('KeyW', { target: editable }), open)).toBeNull();
    });

    it('leaves the arrows to a list that scrolls, but not the other keys', () => {
        for (const [tag, attrs] of [['ul', {}], ['ol', {}], ['div', { role: 'listbox' }], ['div', { role: 'menu' }]]) {
            const { child } = inside(tag, attrs);
            expect(keyAction(key('ArrowDown', { target: child }), open)).toBeNull();
            expect(keyAction(key('ArrowUp', { target: child }), open)).toBeNull();
            expect(keyAction(key('KeyW', { target: child }), open)).toEqual({ type: 'move', code: 'KeyW' });
        }
    });

    it('moves from the page body or the canvas', () => {
        const canvas = document.createElement('canvas');
        document.body.appendChild(canvas);
        expect(keyAction(key('ArrowDown', { target: canvas }), open)).toEqual({ type: 'move', code: 'ArrowDown' });
        expect(keyAction(key('ArrowDown', { target: document.body }), open)).toEqual({ type: 'move', code: 'ArrowDown' });
    });
});
