import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { createPinLayer } from './pinLayer';

let overlay;
let onSelect;
let removed;
let layer;

const pin = (id, title, position = [0, 0, 0]) => ({ id, title, text: '', link: '', image: '', position, view: null });
const buttons = () => overlay.children.map(o => o.element);

beforeEach(() => {
    overlay = new THREE.Group();
    onSelect = vi.fn();
    removed = 0;
    layer = createPinLayer({
        CSS2DObject, overlay, onSelect,
        listen: (target, type, fn) => {
            target.addEventListener(type, fn);
            return () => { removed++; target.removeEventListener(type, fn); };
        }
    });
});

describe('pin markers', () => {
    it('are a numbered button at the point of every pin, the active one marked', () => {
        layer.sync([pin(1, 'Gate', [1, 2, 3]), pin(2, 'Door', [4, 5, 6])], 1);
        expect(buttons().map(b => [b.textContent, b.title, b.classList.contains('active')])).toEqual([
            ['1', 'Gate', false], ['2', 'Door', true]
        ]);
        expect(overlay.children[0].position.toArray()).toEqual([1, 2, 3]);
        expect(buttons()[0].getAttribute('aria-label')).toBe('Pin 1: Gate');
    });

    it('select their pin on a click, by the place it has in the list now', () => {
        layer.sync([pin(1, 'Gate'), pin(2, 'Door')], null);
        buttons()[1].click();
        expect(onSelect).toHaveBeenLastCalledWith(1);

        // The first pin was moved down: the same markers, new numbers
        layer.sync([pin(2, 'Door'), pin(1, 'Gate')], null);
        buttons().find(b => b.title === 'Gate').click();
        expect(onSelect).toHaveBeenLastCalledWith(1);
        expect(buttons().find(b => b.title === 'Gate').textContent).toBe('2');
    });

    it('keep their elements when the list changes around them, and follow a rename or a move of the point', () => {
        layer.sync([pin(1, 'Gate')], null);
        const [first] = buttons();
        layer.sync([pin(1, 'Main gate', [9, 9, 9]), pin(2, 'Door')], 0);
        expect(buttons()[0]).toBe(first);
        expect(first.title).toBe('Main gate');
        expect(first.classList.contains('active')).toBe(true);
        expect(overlay.children[0].position.toArray()).toEqual([9, 9, 9]);
        expect(layer.count).toBe(2);
    });

    it('go away with their pin, element and listener included', () => {
        layer.sync([pin(1, 'Gate'), pin(2, 'Door')], null);
        const [gone] = buttons();
        document.body.append(gone);
        layer.sync([pin(2, 'Door')], null);
        expect(overlay.children).toHaveLength(1);
        expect(gone.isConnected).toBe(false);
        expect(removed).toBe(1);
        gone.click();
        expect(onSelect).not.toHaveBeenCalled();
    });

    it('are all released with the layer', () => {
        layer.sync([pin(1, 'Gate'), pin(2, 'Door')], null);
        layer.dispose();
        expect(overlay.children).toEqual([]);
        expect(removed).toBe(2);
        expect(layer.count).toBe(0);
    });
});
