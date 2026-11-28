/**
 * Look of Potree measurements: colour, line width and area
 * fill applied to every part Potree draws (edges, spheres, circle and angle lines, Line2
 * children, edge labels), from the measure's own properties. One function for measures
 * loaded from a file and for measures edited in the properties dialog.
 */
import { MEASURE_COLOR } from '@/libs/map/mapUtils';
import { textToHtml, htmlToText } from '@/libs/sanitize';
import { FIELD_KEYS, applyFields } from '@/libs/map/annotationIds';
import { PROPERTY_BAG, ensureProperties } from '@/libs/map/potreeMeasurementConverter';

/** '#rrggbb' of a THREE.Color, or the fallback. */
export const hexOf = (color, fallback = MEASURE_COLOR) => (color ? '#' + color.getHexString() : fallback);

/** Recolours a material and sets its line width when it has one. */
function paint(material, color, width) {
    if (!material) return;
    if (color) material.color = color.clone ? color.clone() : color;
    if (width !== undefined && width !== null && material.linewidth !== undefined) material.linewidth = width;
    material.needsUpdate = true;
}

/**
 * Applies measure.color, measure.strokeWidth, measure.fillColor / fillOpacity.
 * @param {any} measure a Potree.Measure
 */
export function applyMeasureStyle(measure) {
    const color = measure.color || null;
    const width = measure.strokeWidth;
    (measure.edges || []).forEach(edge => paint(edge.material, null, width));
    (measure.spheres || []).forEach(sphere => paint(sphere.material, color));
    if (measure.circleLine) paint(measure.circleLine.material, color, width);
    if (measure.angleLine) paint(measure.angleLine.material, color, width);
    measure.traverse(child => { if (child.isLine2) paint(child.material, color, width); });
    if (color) (measure.edgeLabels || []).forEach(label => { if (label.element) label.element.style.color = hexOf(color); });
    applyAreaFill(measure);
}

/** Fill colour and opacity of an area measurement's polygon mesh. */
function applyAreaFill(measure) {
    if (!measure.showArea || !measure.closed) return;
    const fill = measure.fillColor || measure.color;
    const opacity = measure.fillOpacity ?? 0.2;
    measure.traverse(child => {
        if (!child.isMesh || !child.material) return;
        if (fill) child.material.color = fill.clone();
        child.material.opacity = opacity;
        child.material.transparent = true;
        child.material.needsUpdate = true;
    });
}

/**
 * The fields of an annotation that a measure or an annotation of the viewer has, as the properties dialogs read them
 * (`ref`, `category`, ..., see FIELD_KEYS).
 * @param {any} target  a Potree.Measure or Potree.Annotation
 * @returns {Record<string, any>}
 */
export function annotationFieldsOf(target) {
    const bag = target[PROPERTY_BAG] || {};
    return Object.fromEntries(FIELD_KEYS.filter(key => bag[key] !== undefined).map(key => [key, bag[key]]));
}

/**
 * The measure as the map's MeasurementPropertiesDialog reads a feature (`get(prop)`).
 * @param {any} measure
 */
export function measureAsFeature(measure) {
    const values = {
        ...annotationFieldsOf(measure),
        name: htmlToText(measure.name),
        description: measure.description || '',
        stroke: hexOf(measure.color),
        'stroke-width': measure.strokeWidth || 2,
        'stroke-opacity': measure.strokeOpacity ?? 1,
        fill: hexOf(measure.fillColor || measure.color),
        'fill-opacity': measure.fillOpacity ?? 0.2
    };
    return { get: prop => (prop in values ? values[prop] : null) };
}

/**
 * Copies the dialog's properties onto the measure (then applyMeasureStyle draws them); the fields of the
 * annotation go to its property bag.
 * @param {any} measure
 * @param {Record<string, any>} p
 */
export function assignMeasureProperties(measure, p) {
    if (p.name !== undefined) measure.name = textToHtml(p.name);
    if (p.description !== undefined) measure.description = p.description;
    if (p.stroke) measure.color = new THREE.Color(p.stroke);
    if (p['stroke-width'] !== undefined) measure.strokeWidth = p['stroke-width'];
    if (p['stroke-opacity'] !== undefined) measure.strokeOpacity = p['stroke-opacity'];
    if (p['fill-opacity'] !== undefined) measure.fillOpacity = p['fill-opacity'];
    if (p.fill) measure.fillColor = new THREE.Color(p.fill);
    applyFields(ensureProperties(measure), p);
}
