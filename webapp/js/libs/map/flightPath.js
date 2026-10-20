// @ts-check
/**
 * Flight path of geotagged shots (HQ-07, out of Map.vue reloadFileLayers): order by
 * capture time and estimate the speed at each shot.
 *
 * Capture times are DroneDB's `captureTime`: milliseconds since the Unix epoch (the
 * pre-HQ-07 code divided metres by milliseconds, so its fallback speed was 1000× too low
 * and only computed for shots under 0.3 s apart).
 */

const EARTH_RADIUS_M = 6371000;
/** Gaps longer than this (s) are separate flights: no speed across them. */
const MAX_GAP_S = 300;
/** Faster than this (m/s, about 200 km/h) is a GPS glitch, not a drone. */
const MAX_SPEED_MS = 55.6;

/**
 * Great-circle distance in metres.
 * @param {number[]} a [lon, lat] in degrees
 * @param {number[]} b [lon, lat] in degrees
 */
export function haversineMeters(a, b) {
    const rad = Math.PI / 180;
    const dLat = (b[1] - a[1]) * rad;
    const dLon = (b[0] - a[0]) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
    return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * @typedef {object} PathStop
 * @property {number[]} coords       [lon, lat] (WGS84)
 * @property {number} captureTime   ms since the Unix epoch
 * @property {number|null|undefined} [flightSpeed]  speed recorded by the camera (m/s)
 */

/**
 * Sorts the stops by capture time and returns the speed (m/s) at each: the camera's own
 * value when it recorded one, else distance / time from the previous stop; null when
 * neither is meaningful.
 * @template {PathStop} T
 * @param {T[]} stops
 * @returns {{ ordered: T[], speeds: (number|null)[] }}
 */
export function orderFlightPath(stops) {
    const ordered = [...stops].sort((a, b) => a.captureTime - b.captureTime);
    const speeds = ordered.map((stop, i) => {
        if (stop.flightSpeed !== undefined && stop.flightSpeed !== null) return stop.flightSpeed;
        if (i === 0) return null;
        const prev = ordered[i - 1];
        const dt = (stop.captureTime - prev.captureTime) / 1000;
        if (!(dt > 0 && dt < MAX_GAP_S)) return null;
        const speed = haversineMeters(prev.coords, stop.coords) / dt;
        return speed <= MAX_SPEED_MS ? speed : null;
    });
    return { ordered, speeds };
}
