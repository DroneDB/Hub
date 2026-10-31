/**
 * Point / distance / area measurement in the 3D viewer,
 * with Giro3D's DrawTool. The labels are in the user's units (measureFormatters). Navigation is suspended while a shape is drawn (the DrawTool does
 * not do it, so a drag would also move the camera); right click ends a shape.
 */
import { measureFormatters, MEASURE_COLOR as COLOR } from './sceneUtils';

export class MeasureTool {
    /**
     * @param {import('./unifiedScene').UnifiedScene} scene
     * @param {(count: number) => void} onCount
     */
    constructor(scene, onCount) {
        this.scene = scene;
        this.onCount = onCount;
        this.drawTool = null;
        this.abort = null;
        this.shapes = [];
        this.format = measureFormatters(() => scene.mercatorScale);
    }

    /** Draws one shape of `kind` ('point', 'distance', 'area'); a new one cancels the current. */
    async measure(kind) {
        const { scene } = this;
        if (!scene.instance) return;
        if (!this.drawTool) this.drawTool = new scene.libs.DrawTool({ instance: scene.instance });
        if (this.abort) this.abort.abort();
        this.abort = new AbortController();
        const signal = this.abort.signal;
        scene.view.activeTool = kind;
        scene.setNavigationEnabled(false);

        let shape = null;
        try {
            if (kind === 'point') {
                shape = await this.drawTool.createPoint({ signal, color: COLOR });
            } else if (kind === 'distance') {
                shape = await this.drawTool.createLineString({ signal, color: COLOR, showVertices: true, showSegmentLabels: true,
                    segmentLabelFormatter: this.format.length });
            } else if (kind === 'area') {
                shape = await this.drawTool.createPolygon({ signal, color: COLOR, showSurface: true, showSurfaceLabel: true,
                    surfaceLabelFormatter: this.format.area });
            }
        } catch {
            // Cancelled
        }
        scene.view.activeTool = null;
        scene.setNavigationEnabled(true);
        if (shape && scene.instance) {
            this.shapes.push(shape);
            this.onCount(this.shapes.length);
            scene.instance.notifyChange();
        }
    }

    /** Writes the labels of the shapes again: the formatters read the units at call time. */
    relabel() {
        const instance = this.scene.instance;
        if (!instance) return;
        this.shapes.forEach(s => s.rebuildLabels());
        instance.notifyChange();
    }

    clear() {
        const instance = this.scene.instance;
        if (!instance) return;
        this.shapes.forEach(s => { try { instance.remove(s); } catch { /* already gone */ } });
        this.shapes = [];
        this.onCount(0);
        instance.notifyChange();
    }

    dispose() {
        if (this.abort) this.abort.abort();
        if (this.drawTool) {
            try { this.drawTool.dispose(); } catch { /* already gone */ }
        }
        this.abort = this.drawTool = null;
        this.shapes = [];
    }
}
