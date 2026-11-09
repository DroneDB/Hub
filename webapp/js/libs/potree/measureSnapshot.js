/**
 * Plain copies of Potree measurements, so a deleted measure
 * can be recreated by undo and found again by redo (a recreated measure has a new uuid).
 * A copy keeps what the user set on the measure: its points, kind (flags, maxMarkers), name and
 * description, and the look of the properties dialog (measureStyle.assignMeasureProperties).
 */
import { hexOf } from '@/libs/potree/measureStyle';

const FLAGS = ['showDistances', 'showCoordinates', 'showArea', 'showAngles', 'showCircle', 'showHeight', 'showEdges', 'showAzimuth', 'closed'];
// Flags Potree turns on by default
const DEFAULT_ON = new Set(['showDistances', 'showEdges', 'closed']);
// Plain values copied as they are when the measure has them (lengthUnit is one of Potree's LengthUnits)
const VALUES = ['description', 'strokeWidth', 'strokeOpacity', 'fillOpacity', 'maxMarkers', 'lengthUnit'];
const EPSILON = 0.001;

/** @param {any} measure a Potree.Measure */
export function snapshotMeasure(measure) {
    const data = { name: measure.name, color: hexOf(measure.color), points: measure.points.map(p => ({ x: p.position.x, y: p.position.y, z: p.position.z })) };
    FLAGS.forEach(flag => { data[flag] = measure[flag]; });
    VALUES.forEach(key => { if (measure[key] !== undefined && measure[key] !== null) data[key] = measure[key]; });
    if (measure.fillColor) data.fillColor = hexOf(measure.fillColor);
    return data;
}

/** A new Potree.Measure from a snapshot. */
export function restoreMeasure(data) {
    const measure = new Potree.Measure();
    measure.name = data.name || 'Measure';
    FLAGS.forEach(flag => { measure[flag] = data[flag] !== undefined ? data[flag] : DEFAULT_ON.has(flag); });
    VALUES.forEach(key => { if (data[key] !== undefined) measure[key] = data[key]; });
    if (data.color) measure.color = new THREE.Color(data.color);
    if (data.fillColor) measure.fillColor = new THREE.Color(data.fillColor);
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
