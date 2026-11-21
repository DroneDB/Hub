// @ts-check
/**
 * useAnalysisTarget - the elevation model (or other single-band raster) that Stockpile Volume,
 * Raster Analysis and the contour lines work on, when the map shows several rasters.
 *
 * - The candidates are the drawn rasters that the analysis tools accept, top first. The map
 *   has no target until the user opens an analysis panel; then the target is the topmost
 *   candidate.
 * - The target stays until it leaves the map or the user picks another candidate. A rebuild
 *   of the layers, an opacity change or a new order with the target still on the map do
 *   nothing, otherwise a reorder would move the tool to another file.
 * - The target says nothing about the measurements: they belong to the files on show
 *   (useMapMeasurements), so choosing another model asks nothing and drops nothing.
 * - Every change of target (a button, the selector, a target that left the map) re-opens
 *   the panel that is open for the new raster, closing it first so it starts again: no
 *   half-drawn pile, no tool left active. No panel opens in split compare.
 *
 *   const target = useAnalysisTarget({ candidates, splitMode, panels });
 *   target.requestToggle('stockpile');    // the toolbar button
 *   target.requestSwitch(path);           // the "Elevation model" selector
 *   target.onCandidatesChanged();         // after the layers were rebuilt
 *   target.restoreTarget(path);           // a saved view's target: no panel of its own
 *   target.defaultTarget();               // the path a tool picks when nothing was chosen
 */
import { ref, computed, watch } from 'vue';

/** The panels that work on the target. */
export const ANALYSIS_PANELS = Object.freeze(['rasterAnalysis', 'stockpile']);

/**
 * @typedef {{ path: string, label: string, entry: any, file: any }} AnalysisCandidate
 *   a drawn raster the analysis tools accept: its path, the label of its layer row, its entry,
 *   and the file item the panels open for
 * @typedef {'rasterAnalysis'|'stockpile'} AnalysisPanelKind
 */

/**
 * @param {object} ctx
 * @param {() => AnalysisCandidate[]} ctx.candidates       top first
 * @param {() => boolean} [ctx.splitMode]                  split compare draws every raster opaque: no tools
 * @param {object} ctx.panels
 * @param {() => AnalysisPanelKind|null} ctx.panels.openKind   the analysis panel that is open
 * @param {(kind: AnalysisPanelKind, file: any) => void} ctx.panels.open  opens it for a file (closing the others)
 * @param {(kind: AnalysisPanelKind) => void} ctx.panels.close
 */
export function useAnalysisTarget({ candidates, splitMode = () => false, panels }) {
    /** @type {import('vue').Ref<string|null>} */
    const targetPath = ref(null);

    // Read fresh by the steps below; the computed values are for the template
    const items = () => candidates();
    const list = computed(items);
    const target = computed(() => list.value.find(c => c.path === targetPath.value) || null);
    // The entry of the target; null once it left the map
    const targetEntry = computed(() => (target.value ? target.value.entry : null));

    /**
     * What a click on a tool button picks while there is no target, and what replaces a target
     * that left the map: the topmost candidate.
     * @param {AnalysisCandidate[]} found
     * @returns {AnalysisCandidate|null}
     */
    const defaultCandidate = found => found[0] || null;

    /**
     * The path of the raster a tool picks while no target was chosen (null with no candidate):
     * what a saved view records as "no particular elevation model".
     * @returns {string|null}
     */
    function defaultTarget() {
        return defaultCandidate(items())?.path ?? null;
    }

    // The tools show while the map has a candidate, whether a target was chosen or not
    const toolbarEntry = computed(() => (target.value || defaultCandidate(list.value))?.entry || null);

    /**
     * Sets the target and opens `kind` for it (when given, and not in split compare).
     * @param {AnalysisCandidate} next @param {AnalysisPanelKind|null} kind
     */
    function commit(next, kind) {
        targetPath.value = next.path;
        // The panel starts again for the new raster
        if (kind) panels.close(kind);
        if (kind && !splitMode()) panels.open(kind, next.file);
    }

    /**
     * The panel button: picks the target when there is none, then opens the panel for it.
     * @param {AnalysisPanelKind} kind
     * @returns {boolean}  whether the panel was opened
     */
    function requestOpen(kind) {
        if (splitMode()) return false;
        const found = items();
        const current = found.find(c => c.path === targetPath.value);
        if (current) {
            panels.open(kind, current.file);
            return true;
        }
        const next = defaultCandidate(found);
        if (!next) return false;
        commit(next, kind);
        return true;
    }

    /**
     * The button again: closes its panel when it is open, else opens it.
     * @param {AnalysisPanelKind} kind
     */
    function requestToggle(kind) {
        if (panels.openKind() === kind) {
            panels.close(kind);
            return;
        }
        requestOpen(kind);
    }

    /**
     * The selector: the user asks for another candidate; the panel that is open opens again for it.
     * @param {string} path
     * @returns {boolean}  whether the target changed
     */
    function requestSwitch(path) {
        if (path === targetPath.value) return false;
        const next = items().find(c => c.path === path);
        if (!next) return false;
        commit(next, panels.openKind());
        return true;
    }

    /**
     * Sets the target to a candidate the app chose, not the user (a saved view's elevation
     * model). A panel that is open is opened again for the new raster, as for a selector change.
     * @param {string} path
     * @returns {boolean}  whether the target is `path` now
     */
    function restoreTarget(path) {
        if (path === targetPath.value) return true;
        const next = items().find(c => c.path === path);
        if (!next) return false;
        commit(next, panels.openKind());
        return true;
    }

    /**
     * After the layers were rebuilt: a target that left the map is chosen again by the first
     * rule, and its panel opens again; with no candidate left the target is cleared and the
     * panel closes. Nothing happens while the target is still on the map.
     */
    function onCandidatesChanged() {
        if (targetPath.value === null || items().some(c => c.path === targetPath.value)) return;
        const kind = panels.openKind();
        const next = defaultCandidate(items());
        if (next) {
            commit(next, kind);
            return;
        }
        targetPath.value = null;
        if (kind) panels.close(kind);
    }

    // Split compare draws every raster opaque: the tools close and their buttons are disabled
    watch(splitMode, on => {
        if (!on) return;
        const kind = panels.openKind();
        if (kind) panels.close(kind);
    });

    return { targetPath, targetEntry, candidates: list, toolbarEntry, requestOpen, requestToggle, requestSwitch, restoreTarget, defaultTarget, onCandidatesChanged };
}
