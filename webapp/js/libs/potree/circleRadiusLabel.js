// @ts-check
/**
 * The radius label of Potree's circle measure in the unit the user chose. Potree 1.8 writes the radius of its circle as a
 * bare number of the cloud's coordinates (`radius.toFixed(3)`), while its other labels convert to the display unit and
 * name it: a cloud in feet showed its radius in feet as a number next to labels in metres. This wraps the `update` of
 * Potree's Measure once (the vendored file stays as it is) and writes the label again, as the distance labels are
 * written: the radius of the circle through the three points (the one Potree draws, scaledGeometry's circumradius) in
 * the display unit, with its symbol.
 */
import { circumradius } from '@/libs/map/scaledGeometry';

const LABELLED = Symbol('circleRadiusLabelled');

/**
 * The text of the radius label of a measure, or null when it shows no circle.
 * @param {any} measure  a Potree Measure
 * @param {(text: string) => string} addCommas  Potree's thousands separator
 * @returns {string | null}
 */
export function circleRadiusText(measure, addCommas) {
    const points = measure.points || [];
    if (!measure.showCircle || points.length !== 3) return null;
    let radius = circumradius(points[0].position, points[1].position, points[2].position);
    let suffix = '';
    if (measure.lengthUnit && measure.lengthUnitDisplay) {
        // To metres, then to the display unit, as Potree does for distances
        radius = radius / measure.lengthUnit.unitspermeter * measure.lengthUnitDisplay.unitspermeter;
        suffix = ` ${measure.lengthUnitDisplay.code}`;
    }
    return `${addCommas(radius.toFixed(2))}${suffix}`;
}

/**
 * Makes every Potree circle measure label its radius in the display unit. Once per Potree: a second call does nothing.
 * @param {any} Potree  the global Potree
 */
export function labelCircleRadii(Potree) {
    const prototype = Potree?.Measure?.prototype;
    if (!prototype || typeof prototype.update !== 'function' || prototype.update[LABELLED]) return;
    const update = prototype.update;
    const addCommas = (/** @type {string} */ text) => (Potree.Utils?.addCommas ? Potree.Utils.addCommas(text) : text);
    /** @this {any} */
    function updateWithRadius(...args) {
        const result = update.apply(this, args);
        const text = circleRadiusText(this, addCommas);
        if (text !== null && this.circleRadiusLabel) this.circleRadiusLabel.setText(text);
        return result;
    }
    updateWithRadius[LABELLED] = true;
    prototype.update = updateWithRadius;
}
