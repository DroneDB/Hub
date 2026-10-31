import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { FlyControls } from './flyControls';

function makeFly({ enabled = true } = {}) {
    const rig = {
        THREE,
        camera: new THREE.PerspectiveCamera(),
        controls: { target: new THREE.Vector3(0, 0, -5) },
        sceneUp: new THREE.Vector3(0, 1, 0),
        boundsDiagonal: 10,
        targetYaw: 0, targetPitch: 0, yaw: 0, pitch: 0, lookDist: 1,
        syncYawPitch: vi.fn(),
        applyYawPitch: vi.fn()
    };
    const onInteract = vi.fn();
    const state = { enabled };
    const fly = new FlyControls(rig, { enabled: () => state.enabled, onInteract });
    // The canvas is a real element that records what is listened to, with pointer capture stubbed
    const canvas = document.createElement('canvas');
    canvas.setPointerCapture = vi.fn();
    canvas.releasePointerCapture = vi.fn();
    const listened = [];
    fly.attach(canvas, (target, type, fn) => { listened.push(type); target.addEventListener(type, fn); });
    return { fly, rig, canvas, onInteract, state, listened };
}

/** A pointer event: happy-dom has PointerEvent, but a plain Event with fields keeps it explicit. */
function pointer(type, fields = {}) {
    return Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
        pointerId: 1, pointerType: 'mouse', button: 0, clientX: 0, clientY: 0, ...fields
    });
}

describe('FlyControls look', () => {
    it('listens to pointer events, not mouse events, so a finger can look around', () => {
        const { listened } = makeFly();
        expect(listened.sort()).toEqual(['pointercancel', 'pointerdown', 'pointermove', 'pointerup']);
    });

    it('turns the view with one finger dragging', () => {
        const { rig, canvas, onInteract } = makeFly();
        canvas.dispatchEvent(pointer('pointerdown', { pointerType: 'touch', pointerId: 7, clientX: 100, clientY: 100 }));
        expect(onInteract).toHaveBeenCalledTimes(1);
        canvas.dispatchEvent(pointer('pointermove', { pointerType: 'touch', pointerId: 7, clientX: 150, clientY: 80 }));
        expect(rig.targetYaw).toBeCloseTo(-50 * 0.003, 9);
        expect(rig.targetPitch).toBeCloseTo(20 * 0.003, 9);
    });

    it('turns the view with the left mouse button only', () => {
        const { rig, canvas } = makeFly();
        canvas.dispatchEvent(pointer('pointerdown', { button: 2, clientX: 0 }));
        canvas.dispatchEvent(pointer('pointermove', { clientX: 40 }));
        expect(rig.targetYaw).toBe(0);
        canvas.dispatchEvent(pointer('pointerdown', { button: 0, clientX: 0 }));
        canvas.dispatchEvent(pointer('pointermove', { clientX: 40 }));
        expect(rig.targetYaw).toBeCloseTo(-40 * 0.003, 9);
    });

    it('uses every coalesced sample of a move, the way the browser delivers fast pointers', () => {
        const { rig, canvas } = makeFly();
        canvas.dispatchEvent(pointer('pointerdown', { clientX: 0, clientY: 0 }));
        const getCoalescedEvents = vi.fn(() => [{ clientX: 10, clientY: 0 }, { clientX: 25, clientY: 5 }, { clientX: 30, clientY: 0 }]);
        canvas.dispatchEvent(pointer('pointermove', { clientX: 30, clientY: 0, getCoalescedEvents }));
        expect(getCoalescedEvents).toHaveBeenCalled();
        // The path went out to 25 px and back to 30: the total is the end point
        expect(rig.targetYaw).toBeCloseTo(-30 * 0.003, 9);
        expect(rig.targetPitch).toBeCloseTo(0, 9);
    });

    it('takes the move itself when the browser has no coalesced events or sends none', () => {
        const { rig, canvas } = makeFly();
        canvas.dispatchEvent(pointer('pointerdown'));
        canvas.dispatchEvent(pointer('pointermove', { clientX: 10, getCoalescedEvents: () => [] }));
        expect(rig.targetYaw).toBeCloseTo(-10 * 0.003, 9);
    });

    it('keeps the pitch inside the limit', () => {
        const { rig, canvas } = makeFly();
        canvas.dispatchEvent(pointer('pointerdown'));
        canvas.dispatchEvent(pointer('pointermove', { clientY: -100000 }));
        expect(rig.targetPitch).toBeCloseTo(Math.PI * 0.48, 9);
    });

    it('captures the pointer for the drag and lets it go at the end', () => {
        const { canvas } = makeFly();
        canvas.dispatchEvent(pointer('pointerdown', { pointerId: 3 }));
        expect(canvas.setPointerCapture).toHaveBeenCalledWith(3);
        canvas.dispatchEvent(pointer('pointerup', { pointerId: 3 }));
        expect(canvas.releasePointerCapture).toHaveBeenCalledWith(3);
    });

    it('stops looking when the pointer is released or cancelled', () => {
        const { fly, rig, canvas } = makeFly();
        for (const end of ['pointerup', 'pointercancel']) {
            canvas.dispatchEvent(pointer('pointerdown', { clientX: 0 }));
            expect(fly.dragging).toBe(true);
            canvas.dispatchEvent(pointer(end));
            expect(fly.dragging).toBe(false);
            const before = rig.targetYaw;
            canvas.dispatchEvent(pointer('pointermove', { clientX: 50 }));
            expect(rig.targetYaw).toBe(before);
        }
    });

    it('lets a second finger end the look: the pinch is OrbitControls\'', () => {
        const { fly, rig, canvas } = makeFly();
        canvas.dispatchEvent(pointer('pointerdown', { pointerType: 'touch', pointerId: 1, clientX: 0 }));
        canvas.dispatchEvent(pointer('pointerdown', { pointerType: 'touch', pointerId: 2, clientX: 200 }));
        expect(fly.dragging).toBe(false);
        canvas.dispatchEvent(pointer('pointermove', { pointerType: 'touch', pointerId: 1, clientX: 30 }));
        expect(rig.targetYaw).toBe(0);
        // Both up, then a single finger looks again
        canvas.dispatchEvent(pointer('pointerup', { pointerType: 'touch', pointerId: 1 }));
        canvas.dispatchEvent(pointer('pointerup', { pointerType: 'touch', pointerId: 2 }));
        canvas.dispatchEvent(pointer('pointerdown', { pointerType: 'touch', pointerId: 4, clientX: 0 }));
        expect(fly.dragging).toBe(true);
    });

    it('ignores the pointer while disabled (earth mode, a dialog)', () => {
        const { fly, canvas, onInteract, state } = makeFly({ enabled: false });
        canvas.dispatchEvent(pointer('pointerdown'));
        expect(fly.dragging).toBe(false);
        expect(onInteract).not.toHaveBeenCalled();
        state.enabled = true;
        canvas.dispatchEvent(pointer('pointerup'));
        canvas.dispatchEvent(pointer('pointerdown'));
        expect(fly.dragging).toBe(true);
    });

    it('starts from the camera as it is now (a presentation or a pan moved it)', () => {
        const { rig, canvas } = makeFly();
        rig.camera.position.set(0, 0, 3);
        canvas.dispatchEvent(pointer('pointerdown'));
        expect(rig.syncYawPitch).toHaveBeenCalled();
        expect(rig.lookDist).toBeCloseTo(8, 9);
    });
});

describe('FlyControls move', () => {
    it('accelerates along the view with W and coasts to a stop', () => {
        const { fly, rig } = makeFly();
        const start = rig.camera.position.clone();
        fly.press('KeyW');
        for (let i = 0; i < 30; i++) fly.update(1 / 60);
        expect(rig.camera.position.z).toBeLessThan(start.z);
        fly.release('KeyW');
        let moving = true;
        for (let i = 0; i < 120 && moving; i++) moving = fly.update(1 / 60);
        expect(moving).toBe(false);
    });
});
