import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
    UP_AXES, DEFAULT_UP_AXIS, AUTO_UP, MIN_UP_CONFIDENCE, isUpAxis, isUpChoice, upAxisVector, upAxisQuaternion, upAxisOfOrientation, isFlippedAxis,
    estimatedUp, resolvedAutoUp, upChoices, openingUpChoice, quaternionToWorldUp, upChoiceQuaternion
} from './upAxis';

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

const GROUND = { min: [0, 0, 0], max: [1, 1, 1], up: [0, 0, 1], upConfidence: 0.9, upSource: 'ground-plane' };

describe('the choice "auto"', () => {
    it('is a choice but not one of the six axes', () => {
        expect(AUTO_UP).toBe('auto');
        expect(isUpChoice('auto')).toBe(true);
        expect(isUpAxis('auto')).toBe(false);
        expect(isUpChoice('sideways')).toBe(false);
    });

    it('is read from a saved orientation, and an unknown value falls back to the flag or to nothing', () => {
        expect(upAxisOfOrientation({ upAxis: 'auto' })).toBe('auto');
        expect(upAxisOfOrientation({ upAxis: 'auto', flipped: true })).toBe('auto');
        expect(upAxisOfOrientation({ upAxis: 'estimated' })).toBeUndefined();
    });
});

describe('estimatedUp', () => {
    it('takes the up of bounds.json and labels it with its source', () => {
        expect(estimatedUp(GROUND)).toEqual({ up: [0, 0, 1], source: 'ground-plane', label: 'Auto (ground plane)' });
        expect(estimatedUp({ ...GROUND, upSource: 'georef' }).label).toBe('Auto (georeferenced)');
        expect(estimatedUp({ ...GROUND, upSource: 'pca' }).label).toBe('Auto (principal axes)');
        expect(estimatedUp({ ...GROUND, upSource: 'magic' })).toMatchObject({ source: 'estimated', label: 'Auto (estimated)' });
        expect(estimatedUp({ ...GROUND, upSource: undefined }).label).toBe('Auto (estimated)');
    });

    it('trusts the up from a confidence of 0.6, not below it', () => {
        expect(MIN_UP_CONFIDENCE).toBe(0.6);
        expect(estimatedUp({ ...GROUND, upConfidence: 0.6 })).not.toBeNull();
        expect(estimatedUp({ ...GROUND, upConfidence: 0.59 })).toBeNull();
        expect(estimatedUp({ ...GROUND, upConfidence: 1 })).not.toBeNull();
        expect(estimatedUp({ ...GROUND, upConfidence: 0 })).toBeNull();
    });

    it('ignores a missing or malformed up or confidence', () => {
        expect(estimatedUp(null)).toBeNull();
        expect(estimatedUp('up')).toBeNull();
        expect(estimatedUp({ min: [0, 0, 0], max: [1, 1, 1] })).toBeNull();
        expect(estimatedUp({ up: [0, 0, 1] })).toBeNull();
        expect(estimatedUp({ ...GROUND, upConfidence: '0.9' })).toBeNull();
        expect(estimatedUp({ ...GROUND, upConfidence: NaN })).toBeNull();
        expect(estimatedUp({ ...GROUND, up: [0, 1] })).toBeNull();
        expect(estimatedUp({ ...GROUND, up: [0, 0, 1, 0] })).toBeNull();
        expect(estimatedUp({ ...GROUND, up: [0, 0, 0] })).toBeNull();
        expect(estimatedUp({ ...GROUND, up: [NaN, 0, 1] })).toBeNull();
        expect(estimatedUp({ ...GROUND, up: [0, Infinity, 1] })).toBeNull();
        expect(estimatedUp({ ...GROUND, up: ['0', '0', '1'] })).toBeNull();
        expect(estimatedUp({ ...GROUND, up: 'z' })).toBeNull();
    });

    it('normalises an up that is not exactly a unit vector', () => {
        expect(estimatedUp({ ...GROUND, up: [0, 0, 2] }).up).toEqual([0, 0, 1]);
        const { up } = estimatedUp({ ...GROUND, up: [1, 2, 2] });
        expect(Math.hypot(...up)).toBeCloseTo(1, 12);
    });
});

describe('upChoices', () => {
    it('offers Auto first only when there is an estimate', () => {
        expect(upChoices(null).map(c => c.id)).toEqual(['+y', '-y', '+z', '-z', '+x', '-x']);
        const withAuto = upChoices(estimatedUp(GROUND));
        expect(withAuto.map(c => c.id)).toEqual(['auto', '+y', '-y', '+z', '-z', '+x', '-x']);
        expect(withAuto[0].label).toBe('Auto (ground plane)');
    });
});

describe('resolvedAutoUp', () => {
    it('is the up the views file saved for "auto", normalised, over the build\'s estimate', () => {
        const saved = resolvedAutoUp(GROUND, [0, 0, 2]);
        expect(saved.up).toEqual([0, 0, 1]);
        expect(saved.source).toBe('saved');
        // The label still says where the estimate came from, so the select does not change
        expect(saved.label).toBe(estimatedUp(GROUND).label);
    });

    it('is the estimate when the file saved no usable vector', () => {
        expect(resolvedAutoUp(GROUND, undefined)).toEqual(estimatedUp(GROUND));
        expect(resolvedAutoUp(GROUND, [0, 0, 0])).toEqual(estimatedUp(GROUND));
        expect(resolvedAutoUp(GROUND, [0, 1])).toEqual(estimatedUp(GROUND));
        expect(resolvedAutoUp(GROUND, [0, 1, NaN])).toEqual(estimatedUp(GROUND));
        expect(resolvedAutoUp(null, null)).toBeNull();
    });

    it('lets a saved vector stand when a rebuild lost the estimate', () => {
        expect(resolvedAutoUp(null, [1, 0, 0])).toMatchObject({ up: [1, 0, 0], source: 'saved' });
        expect(openingUpChoice({ saved: 'auto', savedUp: [1, 0, 0], bounds: null })).toBe('auto');
    });
});

describe('openingUpChoice', () => {
    const bounds = GROUND;

    it('prefers the saved views, then the choice on this device, then the estimate, then the default', () => {
        expect(openingUpChoice({ saved: '+x', local: '+z', bounds })).toBe('+x');
        expect(openingUpChoice({ local: '+z', bounds })).toBe('+z');
        expect(openingUpChoice({ bounds })).toBe('auto');
        expect(openingUpChoice({ bounds: null })).toBe(DEFAULT_UP_AXIS);
        expect(openingUpChoice({})).toBe(DEFAULT_UP_AXIS);
        expect(openingUpChoice()).toBe(DEFAULT_UP_AXIS);
    });

    it('lets a choice of the user beat the estimate even when it is the default axis', () => {
        expect(openingUpChoice({ local: '-y', bounds })).toBe('-y');
        expect(openingUpChoice({ saved: '+y', bounds })).toBe('+y');
    });

    it('does not use an estimate that is not confident', () => {
        expect(openingUpChoice({ bounds: { ...GROUND, upConfidence: 0.59 } })).toBe(DEFAULT_UP_AXIS);
        expect(openingUpChoice({ bounds: { ...GROUND, upConfidence: 0.6 } })).toBe('auto');
        expect(openingUpChoice({ bounds: { ...GROUND, up: [0, 0, 0] } })).toBe(DEFAULT_UP_AXIS);
    });

    it('skips an "auto" that has no estimate to follow, the next source deciding', () => {
        expect(openingUpChoice({ saved: 'auto', local: '+z', bounds: null })).toBe('+z');
        expect(openingUpChoice({ saved: 'auto', bounds: null })).toBe(DEFAULT_UP_AXIS);
        expect(openingUpChoice({ local: 'auto', bounds: { ...GROUND, upConfidence: 0.1 } })).toBe(DEFAULT_UP_AXIS);
        expect(openingUpChoice({ saved: 'auto', local: '+z', bounds })).toBe('auto');
    });

    it('ignores a value that is not a choice', () => {
        expect(openingUpChoice({ saved: 'sideways', local: 5, bounds })).toBe('auto');
    });
});

describe('the turn for an arbitrary up', () => {
    const turned = (q, v) => new THREE.Vector3(...v).applyQuaternion(new THREE.Quaternion(...q));

    it('takes any unit up to world +Y, as a unit quaternion', () => {
        const ups = [[0, 0, 1], [1, 0, 0], [0.6, 0.8, 0], [-0.3, -0.5, 0.81], [0.1, -0.99, 0.05], [0.3, 0.3, -0.9]];
        for (const raw of ups) {
            const up = new THREE.Vector3(...raw).normalize().toArray();
            const q = quaternionToWorldUp(up);
            expect(Math.hypot(...q)).toBeCloseTo(1, 12);
            expect(turned(q, up).distanceTo(new THREE.Vector3(0, 1, 0))).toBeLessThan(1e-12);
        }
    });

    it('does nothing for +Y and turns -Y by the half turn about X of the table', () => {
        expect(quaternionToWorldUp([0, 1, 0])).toEqual([0, 0, 0, 1]);
        expect(quaternionToWorldUp([0, -1, 0])).toEqual([1, 0, 0, 0]);
        expect(quaternionToWorldUp([1e-12, -1, 0])).toEqual([1, 0, 0, 0]);
    });

    it('agrees with the table for the six axes (the same rotation), so an estimate along an axis changes nothing', () => {
        for (const { id, up, quaternion } of UP_AXES) {
            const q = quaternionToWorldUp(up);
            for (const probe of [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0.3, -0.2, 0.9]]) {
                expect(turned(q, probe).distanceTo(turned(quaternion, probe)), id).toBeLessThan(1e-12);
            }
        }
    });

    it('is a proper rotation that keeps the horizon level (no roll about the new up beyond the shortest turn)', () => {
        // Tilted up: the part of the old Y axis not along the up still leans away from it the same way
        const up = new THREE.Vector3(0, 0.6, 0.8).toArray();
        const q = quaternionToWorldUp(up);
        expect(turned(q, [1, 0, 0]).distanceTo(new THREE.Vector3(1, 0, 0))).toBeLessThan(1e-12);
    });

    it('chooses the turn by the choice: the table for an axis, the estimate for auto', () => {
        expect(upChoiceQuaternion('+z', estimatedUp(GROUND))).toEqual(upAxisQuaternion('+z'));
        expect(upChoiceQuaternion('-y', null)).toEqual([1, 0, 0, 0]);
        const tilted = { ...GROUND, up: [0, 0.6, 0.8] };
        const q = upChoiceQuaternion('auto', estimatedUp(tilted));
        expect(turned(q, [0, 0.6, 0.8]).distanceTo(new THREE.Vector3(0, 1, 0))).toBeLessThan(1e-12);
    });

    it('falls back to the default turn when "auto" has no confident estimate', () => {
        expect(upChoiceQuaternion('auto', null)).toEqual(upAxisQuaternion('+y'));
        expect(upChoiceQuaternion('auto', estimatedUp({ ...GROUND, upConfidence: 0.2 }))).toEqual(upAxisQuaternion('+y'));
    });
});
