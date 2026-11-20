// @ts-check
/**
 * pinLayer - the pins (annotations) of a splat as HTML markers in the scene: a button at the 3D
 * point of every pin, in the frame of the splat file (it sits in the stage's overlay group, which
 * turns with the mesh). A click on a marker selects the pin. The markers follow the list: a pin
 * added, removed, renamed, moved or made active is brought up to date by `sync`, without
 * rebuilding the ones that did not change.
 *
 *   const pins = createPinLayer({ CSS2DObject, overlay: stage.overlay, listen, onSelect: index => ... });
 *   pins.sync(annotations, activeIndex);       // whenever the list or the active pin changes
 *   pins.dispose();
 */

/**
 * @param {object} options
 * @param {any} options.CSS2DObject                   the CSS2DObject class
 * @param {any} options.overlay                       the group the markers are added to
 * @param {(target: any, type: string, listener: (e: any) => void) => (() => void)} options.listen   adds a listener, returns the function that removes it
 * @param {(index: number) => void} options.onSelect  a marker was clicked (the index in the list)
 */
export function createPinLayer({ CSS2DObject, overlay, listen, onSelect }) {
    /** @type {Map<number | string, { object: any, button: HTMLButtonElement, unlisten: () => void, index: number }>} */
    const markers = new Map();

    function release(/** @type {{ object: any, unlisten: () => void }} */ marker) {
        marker.unlisten();
        // A CSS2DObject removes its element when it is removed itself
        marker.object.removeFromParent();
        marker.object.element.remove();
    }

    /**
     * @param {import('./sceneData').Annotation[]} annotations
     * @param {number | null} activeIndex
     */
    function sync(annotations, activeIndex) {
        const ids = new Set(annotations.map(a => a.id));
        for (const [id, marker] of markers) {
            if (ids.has(id)) continue;
            release(marker);
            markers.delete(id);
        }
        annotations.forEach((pin, index) => {
            let marker = markers.get(pin.id);
            if (!marker) {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'splat-pin';
                const object = new CSS2DObject(button);
                overlay.add(object);
                // The index is read when the click happens: the pin may have moved in the list since
                const created = { object, button, index, unlisten: () => {} };
                created.unlisten = listen(button, 'click', () => onSelect(created.index));
                markers.set(pin.id, created);
                marker = created;
            }
            marker.index = index;
            marker.object.position.set(pin.position[0], pin.position[1], pin.position[2]);
            marker.button.textContent = String(index + 1);
            marker.button.title = pin.title;
            marker.button.setAttribute('aria-label', `Pin ${index + 1}: ${pin.title}`);
            marker.button.classList.toggle('active', index === activeIndex);
        });
    }

    function dispose() {
        markers.forEach(release);
        markers.clear();
    }

    return { sync, dispose, get count() { return markers.size; } };
}
