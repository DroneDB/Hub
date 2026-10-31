/**
 * Plain copies of Potree measurements, so a deleted measure
 * can be recreated by undo and found again by redo (a recreated measure has a new uuid).
 */
import { hexOf } from '@/libs/potree/measureStyle';

const FLAGS = ['showDistances', 'showCoordinates', 'showArea', 'showAngles', 'showCircle', 'showHeight', 'showEdges', 'closed'];
// Flags Potree turns on by default
const DEFAULT_ON = new Set(['showDistances', 'showEdges', 'closed']);
const EPSILON = 0.001;

/** @param {any} measure a Potree.Measure */
export function snapshotMeasure(measure) {
    const data = { name: measure.name, color: hexOf(measure.color), points: measure.points.map(p => ({ x: p.position.x, y: p.position.y, z: p.position.z })) };
    FLAGS.forEach(flag => { data[flag] = measure[flag]; });
    return data;
}

/** A new Potree.Measure from a snapshot. */
export function restoreMeasure(data) {
    const measure = new Potree.Measure();
    measure.name = data.name || 'Measure';
    FLAGS.forEach(flag => { measure[flag] = data[flag] !== undefined ? data[flag] : DEFAULT_ON.has(flag); });
    if (data.color) measure.color = new THREE.Color(data.color);
    data.points.forEach(p => measure.addMarker({ position: new THREE.Vector3(p.x, p.y, p.z) }));
    return measure;
}

/** Whether the measure has the snapshot's points (within a millimetre). */
export function matchesSnapshot(measure, data) {
    if (!measure.points || measure.points.length !== data.points.length) return false;
    return measure.points.every((p, i) => Math.abs(p.position.x - data.points[i].x) <= EPSILON &&
        Math.abs(p.position.y - data.points[i].y) <= EPSILON &&
        Math.abs(p.position.z - data.points[i].z) <= EPSILON);
}
