// @ts-check
/**
 * useAnalysisTarget - the elevation model (or other single-band raster) that Stockpile Volume,
 * Raster Analysis and the contour lines work on, when the map shows several rasters.
 *
 * - The candidates are the drawn rasters that the analysis tools accept, top first. The map
 *   has no target until the user opens an analysis panel; then the target is the raster the
 *   measurements belong to if it is a candidate, else the topmost candidate.
 * - The target stays until it leaves the map or the user picks another candidate. A rebuild
 *   of the layers, an opacity change or a new order with the target still on the map do
 *   nothing, otherwise a reorder would move the tool to another file.
 * - The measurements follow the target (useMapMeasurements), so a pile is saved with the
 *   model it was measured on. Every change of target runs in one order: the target is set,
 *   the measurements of its file load, then the panel opens for it. Opening first would draw
 *   the saved pile twice (once from the panel, once from the measurements) and show the
 *   panel's result next to the measurements of the other file.
 * - Every request (a button, the selector, a target that left the map, split compare turning
 *   on) takes a turn, and only the latest one opens a panel, once the measurements of the
 *   target are in: a panel asked for while another waits for them replaces it, instead of
 *   being closed by it a moment later. No panel opens in split compare.
 * - A change the user asks for that takes the measurements to another file, with unsaved
 *   changes, asks to discard them first; one that leaves them in their file (a thermal photo,
 *   whose measurements stay where they are) asks nothing and keeps the changes. A target that
 *   leaves the map is replaced without asking: the user did not ask for it, and the
 *   measurements feature warns about what it drops.
 *
 *   const target = useAnalysisTarget({ candidates, measurementsPath, measurementsPathFor, isDirty, confirmDiscard, ... });
 *   await target.requestToggle('stockpile');    // the toolbar button
 *   await target.requestSwitch(path);           // the "Elevation model" selector
 *   await target.onCandidatesChanged();         // after the layers were rebuilt
 *   target.restoreTarget(path);                 // a saved view's target: no question, no panel of its own
 *   target.defaultTarget();                     // the path a tool picks when nothing was chosen
 */
import { ref, computed, watch } from 'vue';
import { isGeoraster } from '@/libs/entryTypes';

/** The panels that work on the target. */
export const ANALYSIS_PANELS = Object.freeze(['rasterAnalysis', 'stockpile']);

/**
 * Whether the measurements of the map move to this target. A target that is not a georaster (a
 * thermal photo drawn as a raster) keeps them where they are, otherwise the measurements of
 * its folder would disappear with it.
 * @param {any} entry
 */
export function measurementsFollow(entry) {
    return isGeoraster(entry);
}

/**
 * @typedef {{ path: string, label: string, entry: any, file: any }} AnalysisCandidate
 *   a drawn raster the analysis tools accept: its path, the label of its layer row, its entry,
 *   and the file item the panels open for
 * @typedef {'rasterAnalysis'|'stockpile'} AnalysisPanelKind
 */

/**
 * @param {object} ctx
 * @param {() => AnalysisCandidate[]} ctx.candidates       top first
 * @param {() => string|null} ctx.measurementsPath         the raster the measurements belong to now
 * @param {(entry: any) => string|null} ctx.measurementsPathFor  the raster (or folder file) they would belong to with
 *   this entry as the target (the rule of the measurements feature, which they follow)
 * @param {() => boolean} ctx.isDirty                      the measurements have unsaved changes
 * @param {(file: string) => Promise<boolean>} ctx.confirmDiscard  asks to discard the unsaved measurements of a file
 * @param {() => Promise<void>} ctx.reloadMeasurements     shows the measurements of the target now
 * @param {() => boolean} [ctx.splitMode]                  split compare draws every raster opaque: no tools
 * @param {object} ctx.panels
 * @param {() => AnalysisPanelKind|null} ctx.panels.openKind   the analysis panel that is open
 * @param {(kind: AnalysisPanelKind, file: any) => void} ctx.panels.open  opens it for a file (closing the others)
 * @param {(kind: AnalysisPanelKind) => void} ctx.panels.close
 */
export function useAnalysisTarget({
    candidates, measurementsPath, measurementsPathFor, isDirty, confirmDiscard, reloadMeasurements,
    splitMode = () => false, panels
}) {
    /** @type {import('vue').Ref<string|null>} */
    const targetPath = ref(null);
    // Each request takes its turn: one that was overtaken while the measurements loaded does not open its panel
    let turn = 0;
    // The panel the latest request opens once the measurements are in: until then no panel is
    // open, and a change of target in the meantime must still open it
    /** @type {AnalysisPanelKind|null} */
    let reopening = null;
    const openKind = () => panels.openKind() || reopening;
    // Settles once the measurements of the target are in (loaded or not)
    /** @type {Promise<void>} */
    let measurementsIn = Promise.resolve();

    /**
     * The next turn, for a request that opens `kind` (or none): every request before it no
     * longer opens its panel.
     * @param {AnalysisPanelKind|null} kind
     */
    function takeTurn(kind) {
        reopening = kind;
        return ++turn;
    }

    /**
     * Opens `kind` for `file` unless a later request or split compare took over: the one place
     * a request opens its panel.
     * @param {number} mine @param {AnalysisPanelKind|null} kind @param {any} file
     */
    function openIfLatest(mine, kind, file) {
        if (mine !== turn || splitMode()) return false;
        reopening = null;
        if (kind) panels.open(kind, file);
        return true;
    }

    // Read fresh by the steps below; the computed values are for the template
    const items = () => candidates();
    const list = computed(items);
    const target = computed(() => list.value.find(c => c.path === targetPath.value) || null);
    // The entry the measurements follow; null once the target left the map
    const targetEntry = computed(() => (target.value ? target.value.entry : null));

    /**
     * What a click on a tool button picks while there is no target, and what replaces a target
     * that left the map: the raster the measurements belong to if it is a candidate, else the
     * topmost candidate.
     * The raster the measurements belong to is read as if there were no target (the measurements
     * follow the target, so with one chosen they would always name it).
     * @param {AnalysisCandidate[]} found
     * @returns {AnalysisCandidate|null}
     */
    function defaultCandidate(found) {
        const own = measurementsPathFor(null);
        return found.find(c => c.path === own) || found[0] || null;
    }

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
     * Whether making `next` the target drops unsaved measurements: it takes the measurements to
     * another file (useMapMeasurements reads the new one in place of the changes), and they have
     * unsaved changes. A target they do not follow leaves them in the file they are in.
     * @param {AnalysisCandidate} next
     */
    function dropsUnsaved(next) {
        return measurementsPathFor(next.entry) !== measurementsPath() && isDirty();
    }

    /**
     * Sets the target and opens `kind` for it (when given), in the order the header describes.
     * @param {AnalysisCandidate} next @param {AnalysisPanelKind|null} kind
     * @returns {Promise<boolean>}  false when another request or split compare took over while the measurements loaded
     */
    async function commit(next, kind) {
        const mine = takeTurn(kind);
        targetPath.value = next.path;
        // The panel starts again for the new raster: no half-drawn pile, no tool left active
        if (kind) panels.close(kind);
        const load = Promise.resolve(reloadMeasurements());
        measurementsIn = load.then(() => undefined, () => undefined);
        await load;
        return openIfLatest(mine, kind, next.file);
    }

    /**
     * The panel button: picks the target when there is none, then opens the panel for it.
     * With unsaved measurements of another file, asks first; Cancel leaves everything as it was.
     * @param {AnalysisPanelKind} kind
     * @returns {Promise<boolean>}  whether the panel was opened
     */
    async function requestOpen(kind) {
        if (splitMode()) return false;
        const found = items();
        const current = found.find(c => c.path === targetPath.value);
        if (current) {
            // After the measurements of a change of target still loading, and in its place
            const mine = takeTurn(kind);
            await measurementsIn;
            return openIfLatest(mine, kind, current.file);
        }
        const next = defaultCandidate(found);
        if (!next) return false;
        // Usually the target is the raster the measurements are of already, and nothing is dropped
        if (dropsUnsaved(next) && !(await confirmDiscard(fileName(measurementsPath())))) return false;
        return commit(next, kind);
    }

    /**
     * The button again: closes its panel when it is open, else opens it.
     * @param {AnalysisPanelKind} kind
     */
    async function requestToggle(kind) {
        if (panels.openKind() === kind) panels.close(kind);
        else await requestOpen(kind);
    }

    /**
     * The selector: the user asks for another candidate. When that drops unsaved measurements,
     * asks first; Cancel keeps the target, and the selector shows it again.
     * @param {string} path
     * @returns {Promise<boolean>}  whether the target changed
     */
    async function requestSwitch(path) {
        if (path === targetPath.value) return false;
        const next = items().find(c => c.path === path);
        if (!next) return false;
        if (dropsUnsaved(next) && !(await confirmDiscard(fileName(measurementsPath())))) return false;
        // The map may have changed while the question was open
        const still = items().find(c => c.path === path);
        return still ? commit(still, openKind()) : false;
    }

    /**
     * Sets the target to a candidate the app chose, not the user (a saved view's elevation
     * model): no question and no panel of its own. A panel that is open (or waiting for the
     * measurements) is opened again for the new raster, as for a selector change. Refused when
     * the measurements would move to another file with unsaved changes, which the user did not
     * ask to drop. A later request of the user takes a later turn and wins; the measurements load
     * on in the background.
     * @param {string} path
     * @returns {boolean}  whether the target is `path` now
     */
    function restoreTarget(path) {
        if (path === targetPath.value) return true;
        const next = items().find(c => c.path === path);
        if (!next || dropsUnsaved(next)) return false;
        commit(next, openKind()).catch(error => console.error('The measurements of the elevation model did not load', error));
        return true;
    }

    /**
     * After the layers were rebuilt: a target that left the map is chosen again by the first
     * rule, and its panel opens again; with no candidate left the target is cleared and the
     * panel closes. Nothing happens while the target is still on the map.
     */
    async function onCandidatesChanged() {
        if (targetPath.value === null || items().some(c => c.path === targetPath.value)) return;
        const kind = openKind();
        const next = defaultCandidate(items());
        if (next) {
            await commit(next, kind);
            return;
        }
        takeTurn(null);
        targetPath.value = null;
        if (kind) panels.close(kind);
        await reloadMeasurements();
    }

    // Split compare draws every raster opaque: the tools close, their buttons are disabled, and
    // a panel still waiting for the measurements does not open
    watch(splitMode, on => {
        if (!on) return;
        takeTurn(null);
        const kind = panels.openKind();
        if (kind) panels.close(kind);
    });

    return { targetPath, targetEntry, candidates: list, toolbarEntry, requestOpen, requestToggle, requestSwitch, restoreTarget, defaultTarget, onCandidatesChanged };
}

/** @param {string|null} path */
function fileName(path) {
    return String(path || '').split('/').pop() || '';
}
