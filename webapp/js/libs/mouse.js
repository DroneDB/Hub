export default {
    LEFT: 1,
    RIGHT: 3,
};

/** A right-button press and release this far apart or less (CSS pixels) is a right click; more is a drag (D-027) */
export const RIGHT_CLICK_MAX_MOVE_PX = 4;

/** The right mouse button of a `MouseEvent` / `PointerEvent` (`event.button`) */
export const RIGHT_BUTTON = 2;

/**
 * The right click of the gesture rule of every measuring and drawing tool (D-027, FR-XC-17): a
 * right-button release after a move of 4 CSS px or less since the right-button press. A longer
 * right-drag pans the view and does not finish the shape. The press is the `down` event (it must
 * be a right-button press too); a release with no press seen is not a click.
 * @param {{ button: number, clientX: number, clientY: number } | null | undefined} down  the press
 * @param {{ button: number, clientX: number, clientY: number } | null | undefined} up  the release
 * @returns {boolean}
 */
export function isRightClick(down, up) {
    if (!down || !up) return false;
    if (down.button !== RIGHT_BUTTON || up.button !== RIGHT_BUTTON) return false;
    return Math.hypot(up.clientX - down.clientX, up.clientY - down.clientY) <= RIGHT_CLICK_MAX_MOVE_PX;
}
