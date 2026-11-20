/**
 * How the point cloud viewer draws on a HiDPI or a large screen (FR-XC-32, FR-VWR-33, FR-VWR-37, D-042):
 * - the canvas is the CSS size x the applied ratio, min(devicePixelRatio, 2); a screen with another ratio applies it
 *   again. The vendored potree.js sizes its EDL and HQ splat targets from the drawing buffer, draws point sizes (CSS px
 *   in the material and in the Appearance menu) in buffer pixels, and draws the text of its labels at
 *   `Potree.TextSprite.resolutionScale` times their size, which is set here to the ratio;
 * - the labels of a measure (edges, angles, area, height) are larger on a large view: the height of the canvas / 90 px
 *   (measureLabelPx), by the factor of that over Potree's 12 px, after the measuring tool has sized them each frame.
 */
import { appliedPixelRatio, watchPixelRatio } from '@/libs/pixelRatio';
import { measureLabelFactor } from '@/libs/measureScale';

/** The labels of a measure that Potree's measuring tool sizes in every frame. */
function measureLabels(measure) {
    return [
        ...(measure.edgeLabels || []), ...(measure.angleLabels || []), ...(measure.coordinateLabels || []),
        measure.showHeight ? measure.heightLabel : null, measure.areaLabel, measure.circleRadiusLabel
    ].filter(Boolean);
}

/**
 * Makes the labels of the measures `factor` times as large as the measuring tool sized them.
 * @param {{ scene: { measurements?: any[] } }} viewer
 * @param {number} factor
 */
export function scaleMeasureLabels(viewer, factor) {
    if (!(factor > 0) || factor === 1) return;
    for (const measure of viewer.scene?.measurements || []) {
        for (const label of measureLabels(measure)) label.scale.multiplyScalar(factor);
    }
}

/**
 * Sets the pixel ratio of the viewer and of its label textures, and keeps the labels at the size of the view.
 * @param {any} viewer  a Potree.Viewer
 * @param {{ track: (target: any, type: string, handler: Function) => any }} session  removes the update listener on dispose
 * @param {any} [potree]  the Potree global
 * @returns {() => void} stops following the screen's ratio
 */
export function attachPotreeScale(viewer, session, potree = globalThis.Potree) {
    const apply = () => {
        const ratio = appliedPixelRatio();
        // The canvas follows at the next frame: Potree sets the size of the render area on each one
        viewer.renderer.setPixelRatio(ratio);
        if (potree?.TextSprite) potree.TextSprite.resolutionScale = ratio;
    };
    apply();
    const stop = watchPixelRatio(apply);

    session.track(viewer, 'update', () => {
        scaleMeasureLabels(viewer, measureLabelFactor(viewer.renderer.domElement.clientHeight));
    });
    return stop;
}
