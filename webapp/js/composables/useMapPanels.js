// @ts-check
/**
 * useMapPanels - the analysis panels of the dataset map open one at a time (HQ-07,
 * replaces the panel router of useMapAnalysisButtons). Each panel is described by its
 * visibility and open/close functions, all getters, so the features stay unaware of
 * each other.
 *
 *   const panels = useMapPanels({
 *       plantHealth: { visible: () => ..., open: e => ..., close: () => ... },
 *       rasterAnalysis: { ... }, stockpile: { ... }
 *   });
 *   panels.toggle('rasterAnalysis', entry);
 */

/**
 * @typedef {{ visible: () => boolean, open: (entry: any) => void, close: () => void }} Panel
 * @param {Record<string, Panel>} panels
 */
export function useMapPanels(panels) {
    /**
     * Closes `kind` when open; else closes the others and opens it for `entry`.
     * @param {string} kind
     * @param {any} entry
     */
    function toggle(kind, entry) {
        const panel = panels[kind];
        if (panel.visible()) {
            panel.close();
            return;
        }
        for (const [name, other] of Object.entries(panels)) {
            if (name !== kind && other.visible()) other.close();
        }
        panel.open(entry);
    }
    return { toggle };
}
