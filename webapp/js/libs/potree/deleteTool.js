/**
 * The point-cloud viewer's delete tool (HQ-08, out of Potree.vue): while active, a click
 * on a measure removes it (onDelete decides how: the viewer records it for undo). Esc or
 * any Potree tool starting ends it. Its button sits in Potree's own toolbar.
 */
import { measureAt } from '@/libs/potree/measureLabels';

const ACTIVE_BG = 'rgba(231, 76, 60, 0.5)';

export class PotreeDeleteTool {
    /**
     * @param {object} ctx
     * @param {any} ctx.viewer
     * @param {import('@/libs/potree/potreeSession').PotreeSession} ctx.session
     * @param {(measure: any) => void} ctx.onDelete
     * @param {(active: boolean) => void} [ctx.onChange]
     */
    constructor({ viewer, session, onDelete, onChange = () => {} }) {
        this.viewer = viewer;
        this.session = session;
        this.onDelete = onDelete;
        this.onChange = onChange;
        this.active = false;
        this.icon = null;
        this.handlers = [
            [viewer, 'cancel_insertions', () => this.deactivate()],
            [viewer.renderer.domElement, 'click', event => {
                if (event.button !== 0) return;
                const measure = measureAt(viewer, event);
                if (measure) onDelete(measure);
            }],
            [document, 'keydown', event => { if (event.key === 'Escape') this.deactivate(); }]
        ];
    }

    toggle() {
        if (this.active) this.deactivate();
        else this.activate();
    }

    activate() {
        // Ends any Potree insertion in progress (ruler, profile, clipping...)
        this.viewer.dispatchEvent({ type: 'cancel_insertions' });
        this.handlers.forEach(([target, type, fn]) => this.session.track(target, type, fn));
        this.setActive(true);
    }

    deactivate() {
        if (!this.active) return;
        this.handlers.forEach(([target, type, fn]) => this.session.untrack(target, type, fn));
        this.setActive(false);
    }

    setActive(active) {
        this.active = active;
        this.viewer.renderer.domElement.style.cursor = active ? 'crosshair' : '';
        if (this.icon) {
            this.icon.css('background-color', active ? ACTIVE_BG : '');
            this.icon.css('border-radius', 'var(--ddb-radius-sm)');
        }
        this.onChange(active);
    }

    /** Adds the tool's button to Potree's toolbar (`#tools`, once its GUI is loaded). */
    addToolbarButton($) {
        const toolbar = $('#tools');
        if (!toolbar.length) return;
        this.icon = $('<div style="width: 1.5rem; height: 1.5rem; display: flex; align-items: center; justify-content: center;" class="button-icon" title="Delete measurement (click to remove)"><i class="fa-solid fa-trash" style="font-size: x-large; margin: 0"></i></div>');
        this.icon.click(() => this.toggle());
        toolbar.append(this.icon);
    }
}
