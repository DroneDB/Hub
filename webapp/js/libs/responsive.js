// Device class from the screen size (not the window): the layout picked at start-up
export function isMobile() {
    return screen.width <= 767;
}

export function isTablet() {
    return !isMobile() && screen.width <= 991;
}

/** What a browser that does not report its memory (navigator.deviceMemory) is taken to have, in GB. */
export const DEFAULT_DEVICE_MEMORY_GB = 4;

/**
 * Whether the browser reports the memory of the device (navigator.deviceMemory, a usable amount):
 * Chromium browsers do, desktop Firefox and Safari do not.
 * @param {{ deviceMemory?: number }} [nav] the navigator (the global one by default)
 */
export function reportsDeviceMemory(nav = typeof navigator === 'undefined' ? undefined : navigator) {
    const memory = nav?.deviceMemory;
    return typeof memory === 'number' && Number.isFinite(memory) && memory > 0;
}

/**
 * The memory of this device in GB, for the budgets of the 3D viewers (FR-XC-18): the tile cache
 * of the 3D viewer, the points of the point cloud viewer, the paged splats. Browsers round it down
 * to a power of two and cap it at 8; one that gives no usable value (reportsDeviceMemory) is taken
 * to have DEFAULT_DEVICE_MEMORY_GB.
 * @param {{ deviceMemory?: number }} [nav] the navigator (the global one by default)
 */
export function deviceMemoryGb(nav = typeof navigator === 'undefined' ? undefined : navigator) {
    return reportsDeviceMemory(nav) ? nav.deviceMemory : DEFAULT_DEVICE_MEMORY_GB;
}
