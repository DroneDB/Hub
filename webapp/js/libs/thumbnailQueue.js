/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * thumbnailQueue - bounds how many thumbnails load at once (HUB-03).
 *
 * Opening a folder used to start one request per visible tile at the same time (98 for a
 * 4K screen), all queueing on the server's render lane. Here a tile asks for a slot; the
 * queue starts at most `concurrency` loads (6: the browser's HTTP/1.1 connections per host),
 * visible tiles before prefetched ones, and forgets a tile that scrolled away before its
 * turn. A load holds its slot until the tile reports it finished (image load or error).
 */

export const PRIORITY = Object.freeze({ VISIBLE: 0, NEAR: 1 });

/**
 * @param {object} [opts]
 * @param {number} [opts.concurrency]
 */
export function createThumbnailQueue(opts = {}) {
    const concurrency = Math.max(1, opts.concurrency ?? 6);
    const waiting = [];
    let running = 0;
    let seq = 0;

    function pump() {
        while (running < concurrency && waiting.length > 0) {
            // Highest priority first, then first come first served
            let best = 0;
            for (let i = 1; i < waiting.length; i++) {
                const a = waiting[i], b = waiting[best];
                if (a.priority < b.priority || (a.priority === b.priority && a.seq < b.seq)) best = i;
            }
            const ticket = waiting.splice(best, 1)[0];
            ticket.state = 'running';
            running++;
            try {
                ticket.start();
            } catch (e) {
                console.warn('Thumbnail load failed to start', e);
                ticket.release();
            }
        }
    }

    /**
     * Asks for a slot. `start` runs when the slot is granted (maybe at once).
     * @param {() => void} start
     * @param {number} [priority] PRIORITY.VISIBLE or PRIORITY.NEAR
     * @returns {{ release: () => void, cancel: () => void, setPriority: (p: number) => void, readonly state: string }}
     */
    function enqueue(start, priority = PRIORITY.VISIBLE) {
        const ticket = {
            start,
            priority,
            seq: ++seq,
            state: 'waiting',
            // The load finished (or failed): its slot goes to the next tile
            release() {
                if (ticket.state !== 'running') return;
                ticket.state = 'done';
                running--;
                pump();
            },
            // The tile no longer needs it (scrolled away, unmounted)
            cancel() {
                if (ticket.state === 'waiting') {
                    const i = waiting.indexOf(ticket);
                    if (i >= 0) waiting.splice(i, 1);
                    ticket.state = 'cancelled';
                } else {
                    ticket.release();
                }
            },
            setPriority(p) {
                ticket.priority = p;
            }
        };
        waiting.push(ticket);
        pump();
        return ticket;
    }

    return {
        enqueue,
        get running() {
            return running;
        },
        get waiting() {
            return waiting.length;
        }
    };
}

/**
 * Calls back when an element comes within `rootMargin` of the scroll viewport (HUB-03):
 * no bounding-rect scan of every tile on each scroll or update.
 * @param {object} opts
 * @param {() => Element|null} opts.root the scroll container
 * @param {string} [opts.rootMargin]
 * @param {typeof IntersectionObserver} [opts.Observer] injectable for tests
 */
export function createVisibilityTracker(opts) {
    const Observer = opts.Observer ?? globalThis.IntersectionObserver;
    const callbacks = new Map();
    let observer = null;

    function ensureObserver() {
        if (observer || !Observer) return observer;
        observer = new Observer(entries => {
            for (const e of entries) {
                const cb = callbacks.get(e.target);
                if (cb) cb(e.isIntersecting);
            }
        }, { root: opts.root?.() ?? null, rootMargin: opts.rootMargin ?? '200px' });
        return observer;
    }

    return {
        /** `onChange(visible)` whenever `el` enters or leaves the viewport (plus margin). */
        observe(el, onChange) {
            if (!el) return;
            callbacks.set(el, onChange);
            const o = ensureObserver();
            if (o) o.observe(el);
            else onChange(true); // no IntersectionObserver: everything counts as visible
        },
        unobserve(el) {
            if (!el) return;
            callbacks.delete(el);
            observer?.unobserve(el);
        },
        /** The scroll container changed (e.g. virtual grid on/off): observe again under it. */
        reset() {
            const els = [...callbacks.entries()];
            observer?.disconnect();
            observer = null;
            for (const [el, cb] of els) this.observe(el, cb);
        },
        disconnect() {
            observer?.disconnect();
            observer = null;
            callbacks.clear();
        }
    };
}

/** Thumbnail size to request: the tile's CSS size times the pixel ratio, in cache-friendly steps. */
export function thumbnailRequestSize(cssPx, devicePixelRatio = globalThis.devicePixelRatio ?? 1) {
    const wanted = cssPx * Math.max(1, devicePixelRatio || 1);
    for (const step of [128, 256, 512]) if (wanted <= step) return step;
    return 512;
}
