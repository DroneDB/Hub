/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A server-sent events stream read with fetch (HUB-05): EventSource cannot send the
 * Authorization header the Registry needs.
 *
 * @param {object} opts
 * @param {string} opts.url
 * @param {Record<string,string>} [opts.headers]
 * @param {(event: {type: string, data: string, id?: string}) => void} opts.onEvent
 * @param {() => void} [opts.onOpen] the server accepted the stream
 * @param {(error?: Error) => void} [opts.onClose] the stream ended or failed (not when aborted)
 * @param {AbortSignal} [opts.signal] closes the stream
 * @param {typeof fetch} [opts.fetchImpl]
 */
export async function openEventStream({ url, headers = {}, onEvent, onOpen, onClose, signal, fetchImpl }) {
    const doFetch = fetchImpl ?? globalThis.fetch;
    let error;
    try {
        const res = await doFetch(url, { headers: { Accept: 'text/event-stream', ...headers }, signal, cache: 'no-store' });
        if (!res.ok || !res.body) throw new Error(`Event stream unavailable (HTTP ${res.status})`);
        onOpen?.();

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const parser = createEventParser(onEvent);
        for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            parser.push(decoder.decode(value, { stream: true }));
        }
    } catch (e) {
        if (e?.name === 'AbortError' || signal?.aborted) return;
        error = e;
    }
    if (!signal?.aborted) onClose?.(error);
}

/**
 * Incremental parser of the text/event-stream format: feed it text as it arrives.
 * @param {(event: {type: string, data: string, id?: string}) => void} onEvent
 */
export function createEventParser(onEvent) {
    let buffer = '';
    let type = '';
    let data = [];
    let id;

    const dispatch = () => {
        if (data.length > 0 || type) onEvent({ type: type || 'message', data: data.join('\n'), id });
        type = '';
        data = [];
    };

    return {
        push(text) {
            buffer += text;
            let newline;
            while ((newline = buffer.search(/\r\n|\r|\n/)) >= 0) {
                const line = buffer.slice(0, newline);
                buffer = buffer.slice(newline + (buffer.startsWith('\r\n', newline) ? 2 : 1));
                if (line === '') {
                    dispatch();
                } else if (!line.startsWith(':')) { // ":" lines are comments (keep-alive)
                    const colon = line.indexOf(':');
                    const field = colon < 0 ? line : line.slice(0, colon);
                    const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '');
                    if (field === 'event') type = value;
                    else if (field === 'data') data.push(value);
                    else if (field === 'id') id = value;
                }
            }
        }
    };
}
