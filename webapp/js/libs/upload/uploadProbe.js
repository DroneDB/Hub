/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * uploadProbe - measures the upload path to the Registry (UPL-01 A.2): one 8 MB upload
 * on its own, then six at once, to POST /sys/upload-probe (the server discards the body).
 *
 * A reverse proxy that streams uploads over HTTP/2 with a small flow-control window caps
 * every upload stream at window / round-trip time, whatever the uplink: the probe shows
 * that cap instead of leaving it a silent "uploads are slow".
 */
import { negotiatedProtocol, isMultiplexed, HTTP1_CONNECTIONS } from './protocolLimits';

export const PROBE_BYTES = 8 * 1024 * 1024;
export const PROBE_PARALLEL = HTTP1_CONNECTIONS;
// The windows nginx (64 KB, the default) and the recommended tuning (1-2 MB) use
const KNOWN_WINDOWS = [64 * 1024, 1024 * 1024, 2 * 1024 * 1024];

/**
 * Runs the probe.
 * @param {object} deps
 * @param {(body: Blob) => Promise<void>} deps.upload sends one probe body, resolves when answered
 * @param {() => Promise<void>} deps.ping a tiny request, for the round-trip time
 * @param {() => number} [deps.now]
 * @param {() => string|null} [deps.protocol]
 * @returns {Promise<{protocol, rttMs, singleMBps, parallelMBps, hint}>}
 */
export async function runUploadProbe({ upload, ping, now = () => performance.now(), protocol = negotiatedProtocol }) {
    // Round trip: best of three tiny requests (the first may pay for a new connection)
    let rttMs = Infinity;
    for (let i = 0; i < 3; i++) {
        const t0 = now();
        await ping();
        rttMs = Math.min(rttMs, now() - t0);
    }

    const body = randomBlob(PROBE_BYTES);

    const t1 = now();
    await upload(body);
    const singleMBps = mbps(PROBE_BYTES, now() - t1);

    const t2 = now();
    await Promise.all(Array.from({ length: PROBE_PARALLEL }, () => upload(body)));
    const parallelMBps = mbps(PROBE_BYTES * PROBE_PARALLEL, now() - t2);

    const proto = protocol();
    return { protocol: proto, rttMs, singleMBps, parallelMBps, hint: windowHint(proto, rttMs, singleMBps) };
}

/**
 * When an HTTP/2 or HTTP/3 upload stream runs at about window / RTT for a known proxy
 * window, the proxy window is the limit: returns that window in bytes, else null.
 */
export function windowHint(protocol, rttMs, singleMBps) {
    if (!isMultiplexed(protocol) || !(rttMs > 0) || !(singleMBps > 0)) return null;
    for (const window of KNOWN_WINDOWS) {
        const capMBps = window / (rttMs / 1000) / (1024 * 1024);
        // Within 35 %: the measured rate is the window cap, not the link
        if (Math.abs(singleMBps - capMBps) / capMBps <= 0.35) return { windowBytes: window, capMBps };
    }
    return null;
}

function mbps(bytes, ms) {
    return ms > 0 ? bytes / (1024 * 1024) / (ms / 1000) : 0;
}

// Random bytes: a compressing proxy or link must not make the probe look faster than real files
function randomBlob(size) {
    const bytes = new Uint8Array(size);
    const chunk = 65536; // getRandomValues limit per call
    for (let offset = 0; offset < size; offset += chunk)
        globalThis.crypto.getRandomValues(bytes.subarray(offset, Math.min(size, offset + chunk)));
    return new Blob([bytes], { type: 'application/octet-stream' });
}
