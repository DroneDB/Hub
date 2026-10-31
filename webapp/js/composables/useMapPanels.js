// @ts-check
/**
 * useMapPanels - the analysis panels of the dataset map open one at a time. Each panel is described by its
 * visibility and open/close functions, all getters, so the features stay unaware of
 * each other.
 *
 *   const panels = useMapPanels({
 *       plantHealth: { visible: () => ..., open: e => ..., close: () => ... },
 *       rasterAnalysis: { ... }, stockpile: { ... }
 *   });
 *   panels.open('plantHealth', file, options);   // closes the others first
 *   panels.toggle('rasterAnalysis', entry);
 */

/**
 * @typedef {{ visible: () => boolean, open: (...args: any[]) => void, close: () => void }} Panel
 * @param {Record<string, Panel>} panels
 */
export function useMapPanels(panels) {
    /**
     * Closes the other panels and opens `kind` with `args`.
     * @param {string} kind
     * @param {...any} args
     */
    function open(kind, ...args) {
        for (const [name, other] of Object.entries(panels)) {
            if (name !== kind && other.visible()) other.close();
        }
        return panels[kind].open(...args);
    }

    /**
     * Closes `kind` when open, else opens it (closing the others).
     * @param {string} kind
     * @param {...any} args
     */
    function toggle(kind, ...args) {
        if (panels[kind].visible()) panels[kind].close();
        else open(kind, ...args);
    }
    return { open, toggle };
}
