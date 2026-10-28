import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
    distanceBetween, pathLength, heightBetween, projectedArea, centroid, metersPerUnitFrom, sceneScale, sceneLabels, shapeLabels, isMeasureKind
} from './measureMath';

describe('lengths', () => {
    it('are straight, and add up along a polyline', () => {
        expect(distanceBetween([0, 0, 0], [3, 4, 12])).toBe(13);
        expect(pathLength([[0, 0, 0], [3, 4, 0], [3, 4, 5]])).toBe(10);
        expect(pathLength([[1, 1, 1]])).toBe(0);
    });
});

describe('height', () => {
    it('is the difference along the up, whatever the way round and however far off to the side', () => {
        expect(heightBetween([5, 0, 1], [-2, 0, 4], [0, 0, 1])).toBe(3);
        expect(heightBetween([-2, 0, 4], [5, 0, 1], [0, 0, 1])).toBe(3);
    });

    it('follows a tilted up, and does not need it to be a unit vector', () => {
        // Up leaning to +y: only the part of the step along it counts
        expect(heightBetween([0, 0, 0], [0, 3, 4], [0, 0.6, 0.8])).toBeCloseTo(5, 12);
        expect(heightBetween([0, 0, 0], [0, 3, 4], [0, 6, 8])).toBeCloseTo(5, 12);
        expect(heightBetween([0, 0, 0], [3, 0, 0], [0, 1, 0])).toBe(0);
    });

    it('is nothing when there is no up', () => {
        expect(heightBetween([0, 0, 0], [0, 0, 5], [0, 0, 0])).toBe(0);
    });
});

describe('area', () => {
    const square = [[0, 0, 0], [4, 0, 0], [4, 3, 0], [0, 3, 0]];

    it('is the polygon seen from above, whatever the order of the points', () => {
        expect(projectedArea(square, [0, 0, 1])).toBe(12);
        expect(projectedArea([...square].reverse(), [0, 0, 1])).toBe(12);
        expect(projectedArea(square.map(([x, y, z]) => [x + 100, y - 7, z + 3]), [0, 0, 1])).toBeCloseTo(12, 9);
    });

    it('counts a polygon on a slope as the ground it covers: its area times the cosine of the slope', () => {
        // The same rectangle raised by 3 along x over 4: the slope is 3-4-5, its surface 15, the ground below it 12
        const slope = [[0, 0, 0], [4, 0, 3], [4, 3, 3], [0, 3, 0]];
        expect(projectedArea(slope, [0, 0, 1])).toBeCloseTo(12, 9);
        // Seen along the x axis it is a wall: 3 wide and 3 high
        expect(projectedArea(slope, [1, 0, 0])).toBeCloseTo(9, 9);
    });

    it('is found on the ground plane perpendicular to a tilted up, not on the plane of the axes', () => {
        // A level 5 by 2 rectangle on the plane perpendicular to a tilted up, turned into the scene's axes
        const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(30));
        const up = new THREE.Vector3(0, 0, 1).applyQuaternion(tilt);
        const corners = [[0, 0], [5, 0], [5, 2], [0, 2]].map(([x, y]) => new THREE.Vector3(x, y, 0).applyQuaternion(tilt).toArray());
        expect(projectedArea(corners, up.toArray())).toBeCloseTo(10, 9);
        // Projected on the plane of the axes instead, it would lose the cosine of the tilt
        expect(projectedArea(corners, [0, 0, 1])).toBeCloseTo(10 * Math.cos(THREE.MathUtils.degToRad(30)), 9);
        // The up need not be a unit vector
        expect(projectedArea(corners, up.clone().multiplyScalar(7).toArray())).toBeCloseTo(10, 9);
    });

    it('is nothing for fewer than three points or no up', () => {
        expect(projectedArea(square.slice(0, 2), [0, 0, 1])).toBe(0);
        expect(projectedArea(square, [0, 0, 0])).toBe(0);
    });

    it('has a middle', () => {
        expect(centroid(square)).toEqual([2, 1.5, 0]);
    });
});

describe('scale', () => {
    it('is the real length over the length in the file', () => {
        // Two points 4 units apart on something 10 m long: a unit is 2.5 m
        expect(metersPerUnitFrom([0, 0, 0], [0, 0, 4], 10)).toBe(2.5);
        expect(metersPerUnitFrom([1, 1, 1], [1, 4, 5], 0.5)).toBe(0.1);
    });

    it('cannot be told from the same point twice, or from a length that is not a positive number', () => {
        expect(metersPerUnitFrom([1, 2, 3], [1, 2, 3], 10)).toBeNull();
        expect(metersPerUnitFrom([0, 0, 0], [1, 0, 0], 0)).toBeNull();
        expect(metersPerUnitFrom([0, 0, 0], [1, 0, 0], -3)).toBeNull();
        expect(metersPerUnitFrom([0, 0, 0], [1, 0, 0], NaN)).toBeNull();
    });

    it('is metres for a georeferenced scene whatever the file says, metres by the user\'s scale otherwise, else units', () => {
        expect(sceneScale({ georeferenced: true, metersPerUnit: 5 })).toEqual({ metersPerUnit: 1, metric: true, unit: 'm' });
        expect(sceneScale({ metersPerUnit: 2.5 })).toEqual({ metersPerUnit: 2.5, metric: true, unit: 'm' });
        expect(sceneScale({})).toEqual({ metersPerUnit: 1, metric: false, unit: 'units' });
        expect(sceneScale({ metersPerUnit: 0 })).toMatchObject({ metric: false });
        expect(sceneScale({ metersPerUnit: null })).toMatchObject({ unit: 'units' });
    });
});

describe('labels', () => {
    const labelsFor = scene => sceneLabels(() => sceneScale(scene));

    it('are in metres with the scale, switching to kilometres like the other viewers', () => {
        const labels = labelsFor({ metersPerUnit: 2 });
        expect(labels.length(5)).toBe('10.0 m');
        expect(labels.length(600)).toBe('1.20 km');
        expect(labels.area(3)).toBe('12 m²');
    });

    it('say units, and never kilometres, in a scene with no scale', () => {
        const labels = labelsFor({});
        expect(labels.length(1.5)).toBe('1.50 units');
        expect(labels.length(5000)).toBe('5000.00 units');
        expect(labels.area(2)).toBe('2.00 units²');
        expect(labels.coordinates([1, 2.345, -3])).toBe('1.00, 2.35, -3.00 units');
    });

    it('follow a scale that changes after they were made', () => {
        let scene = {};
        const labels = sceneLabels(() => sceneScale(scene));
        expect(labels.length(2)).toBe('2.00 units');
        scene = { metersPerUnit: 3 };
        expect(labels.length(2)).toBe('6.0 m');
    });

    it('give the coordinates of a georeferenced point in metres', () => {
        expect(labelsFor({ georeferenced: true }).coordinates([10, 20, 30])).toBe('10.00, 20.00, 30.00 m');
    });
});

describe('the labels of a shape', () => {
    const labels = sceneLabels(() => sceneScale({ georeferenced: true }));
    const up = [0, 0, 1];

    it('are one for a point: its coordinates', () => {
        expect(shapeLabels('point', [[1, 2, 3]], up, labels)).toEqual([{ at: [1, 2, 3], text: '1.00, 2.00, 3.00 m', kind: 'value' }]);
    });

    it('are one per segment of a distance, and the total from the third point', () => {
        const two = shapeLabels('distance', [[0, 0, 0], [3, 4, 0]], up, labels);
        expect(two).toEqual([{ at: [1.5, 2, 0], text: '5.0 m', kind: 'segment' }]);
        const three = shapeLabels('distance', [[0, 0, 0], [3, 4, 0], [3, 4, 12]], up, labels);
        expect(three.map(l => l.text)).toEqual(['5.0 m', '12.0 m', 'Total 17.0 m']);
    });

    it('are the height along the up for a height, and the projected area for an area', () => {
        expect(shapeLabels('height', [[9, 9, 1], [0, 0, 4]], up, labels)[0].text).toBe('Height 3.0 m');
        const area = shapeLabels('area', [[0, 0, 0], [4, 0, 0], [4, 3, 0], [0, 3, 0]], up, labels);
        expect(area).toEqual([{ at: [2, 1.5, 0], text: '12 m²', kind: 'value' }]);
    });

    it('wait for enough points', () => {
        expect(shapeLabels('area', [[0, 0, 0], [1, 0, 0]], up, labels)).toEqual([]);
        expect(shapeLabels('height', [[0, 0, 0]], up, labels)).toEqual([]);
        expect(shapeLabels('distance', [[0, 0, 0]], up, labels)).toEqual([]);
        expect(shapeLabels('volume', [[0, 0, 0]], up, labels)).toEqual([]);
        expect(isMeasureKind('volume')).toBe(false);
    });
});
