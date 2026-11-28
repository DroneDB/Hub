/**
 * uploadSlots - the request slots that every upload queue of the page shares.
 *
 * The protocol limit (protocolLimits) is what the connection to the Registry can carry for uploads, not what one
 * queue may take: the dataset uploads keep one queue per dataset and /upload has its own, so with a limit per queue
 * two datasets uploading in the background would hold 8 of the 6 HTTP/1.1 connections and the pages' own requests
 * would wait behind them. Each queue therefore takes a slot here before it starts a request and gives it back when
 * the request settles; a queue that found no free slot is woken when another queue gives one back.
 */
import { negotiatedProtocol, uploadConcurrency } from './protocolLimits';

/**
 * @param {() => number} capacity how many requests may run together (read on every decision)
 */
export function createUploadSlots(capacity) {
    let used = 0;
    /** @type {Set<() => void>} */
    const waiting = new Set();

    return {
        /** Takes a slot when one is free. @returns {boolean} */
        tryAcquire() {
            if (used >= Math.max(1, capacity())) return false;
            used++;
            return true;
        },
        /** Gives a slot back and lets the queues that wait for one start their next request. */
        release() {
            used = Math.max(0, used - 1);
            for (const wake of [...waiting]) {
                if (used >= Math.max(1, capacity())) break;
                wake();
            }
        },
        /**
         * Calls `wake` whenever a slot is given back, until the returned function is called.
         * @param {() => void} wake
         */
        onRelease(wake) {
            waiting.add(wake);
            return () => { waiting.delete(wake); };
        },
        /** The slots taken now. */
        inUse: () => used
    };
}

/** The page's slots: 4 over HTTP/1.1, 16 over HTTP/2 or HTTP/3, whichever queue asks. */
export const sharedUploadSlots = createUploadSlots(() => uploadConcurrency(negotiatedProtocol()));
