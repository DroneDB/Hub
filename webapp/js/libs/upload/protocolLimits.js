/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * protocolLimits - how many uploads can run at once on the connection to the Registry
 * (UPL-01 A.3).
 *
 * Over HTTP/1.1 a browser opens 6 connections per host: a 7th request only waits in the
 * browser's queue. Over HTTP/2 or HTTP/3 requests are streams on one connection, each
 * with its own flow-control window, so more of them can run in parallel.
 */

export const HTTP1_CONNECTIONS = 6;
export const MULTIPLEXED_STREAMS = 16;

/**
 * The protocol the browser negotiated with `origin`, from Resource Timing
 * (`nextHopProtocol`), or null when unknown (no entry yet, cross-origin without
 * Timing-Allow-Origin, old browser).
 * @param {string} [origin]
 * @param {Performance} [perf]
 * @returns {string|null} e.g. 'h2', 'h3', 'http/1.1'
 */
export function negotiatedProtocol(origin = globalThis.location?.origin, perf = globalThis.performance) {
    if (!perf || typeof perf.getEntriesByType !== 'function') return null;

    const entries = [
        ...perf.getEntriesByType('resource'),
        ...perf.getEntriesByType('navigation')
    ];
    for (let i = entries.length - 1; i >= 0; i--) {
        const e = entries[i];
        if (e.nextHopProtocol && (!origin || e.name.startsWith(origin))) return e.nextHopProtocol;
    }
    return null;
}

/**
 * Upload requests to run in parallel for a protocol: 16 on h2/h3, 6 otherwise.
 * @param {string|null} protocol
 */
export function uploadConcurrency(protocol) {
    return isMultiplexed(protocol) ? MULTIPLEXED_STREAMS : HTTP1_CONNECTIONS;
}

/** Whether `protocol` runs requests as streams on one connection (HTTP/2, HTTP/3). */
export function isMultiplexed(protocol) {
    return typeof protocol === 'string' && /^h[23]/i.test(protocol);
}
