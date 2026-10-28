import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { UP_AXES, DEFAULT_UP_AXIS, isUpAxis, upAxisVector, upAxisQuaternion, upAxisOfOrientation, isFlippedAxis } from './upAxis';

describe('up axes', () => {
    it('offer the six axes of the stored coordinates, with -y the default', () => {
        expect(UP_AXES.map(a => a.id)).toEqual(['+y', '-y', '+z', '-z', '+x', '-x']);
        expect(DEFAULT_UP_AXIS).toBe('-y');
        expect(UP_AXES.every(a => isUpAxis(a.id))).toBe(true);
        expect(isUpAxis('up')).toBe(false);
        expect(isUpAxis(undefined)).toBe(false);
    });

    it('map each id to its unit vector', () => {
        const vectors = Object.fromEntries(UP_AXES.map(a => [a.id, upAxisVector(THREE, a.id).toArray()]));
        expect(vectors).toEqual({ '+y': [0, 1, 0], '-y': [0, -1, 0], '+z': [0, 0, 1], '-z': [0, 0, -1], '+x': [1, 0, 0], '-x': [-1, 0, 0] });
    });

    it('turn the mesh so that the chosen axis points along world +Y', () => {
        for (const { id } of UP_AXES) {
            const q = new THREE.Quaternion(...upAxisQuaternion(id));
            expect(q.length()).toBeCloseTo(1, 12);
            const up = upAxisVector(THREE, id).applyQuaternion(q);
            expect(up.distanceTo(new THREE.Vector3(0, 1, 0))).toBeLessThan(1e-12);
        }
    });

    it('keep the half turn about X that scenes saved as flipped use, and leave +y alone', () => {
        expect(upAxisQuaternion('-y')).toEqual([1, 0, 0, 0]);
        expect(upAxisQuaternion('+y')).toEqual([0, 0, 0, 1]);
    });

    it('turn a Z-up scene upright without mirroring it (a proper rotation)', () => {
        const q = new THREE.Quaternion(...upAxisQuaternion('+z'));
        // Z up -> Y; the horizontal axes stay horizontal
        expect(new THREE.Vector3(1, 0, 0).applyQuaternion(q).distanceTo(new THREE.Vector3(1, 0, 0))).toBeLessThan(1e-12);
        expect(new THREE.Vector3(0, 1, 0).applyQuaternion(q).distanceTo(new THREE.Vector3(0, 0, -1))).toBeLessThan(1e-12);
    });

    it('hand out a copy of the quaternion, not the table', () => {
        upAxisQuaternion('+z')[0] = 9;
        expect(upAxisQuaternion('+z')[0]).toBeLessThan(0);
    });
});

describe('upAxisOfOrientation', () => {
    it('reads the axis, else the flipped flag of older sidecars, else nothing', () => {
        expect(upAxisOfOrientation({ upAxis: '+x', flipped: true })).toBe('+x');
        expect(upAxisOfOrientation({ flipped: true })).toBe('-y');
        expect(upAxisOfOrientation({ flipped: false })).toBe('+y');
        expect(upAxisOfOrientation({ upAxis: 'nope', flipped: true })).toBe('-y');
        expect(upAxisOfOrientation({ upAxis: 'nope' })).toBeUndefined();
        expect(upAxisOfOrientation({})).toBeUndefined();
        expect(upAxisOfOrientation(undefined)).toBeUndefined();
    });

    it('flags only the half turn as flipped', () => {
        expect(UP_AXES.filter(a => isFlippedAxis(a.id)).map(a => a.id)).toEqual(['-y']);
    });
});
