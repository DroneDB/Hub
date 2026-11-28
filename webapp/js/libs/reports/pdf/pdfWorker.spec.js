/**
 * The worker of the PDF, run as the browser runs it: it says it is ready, then answers its job with the PDF of the
 * model, laid out by the real library from a copy of the job (what a message gives the worker), or with the error.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { pdfModel, fullAssets, ORIGIN } from '@/libs/reports/pdf/pdfDocument.fixtures';

const posted = [];
let saved;
afterEach(() => {
    globalThis.postMessage = saved.postMessage;
    globalThis.onmessage = saved.onmessage;
    posted.length = 0;
});

async function startWorker() {
    saved = { postMessage: globalThis.postMessage, onmessage: globalThis.onmessage };
    globalThis.postMessage = message => posted.push(message);
    vi.resetModules();
    await import('./pdfWorker.js');
}
const answer = () => vi.waitFor(() => { expect(posted.length).toBeGreaterThan(1); return posted[1]; }, { timeout: 60000 });

describe('the PDF worker', () => {
    it('says it is ready, then answers the job with a PDF of every page of the report', async () => {
        await startWorker();
        expect(posted).toEqual([{ type: 'ready' }]);

        const model = pdfModel();
        // What postMessage gives the worker: a copy, in which the figures are still keyed by the blocks of the model
        const job = structuredClone({ model, assets: fullAssets(model), origin: ORIGIN });
        globalThis.onmessage({ data: job });
        const reply = await answer();

        expect(reply.type).toBe('blob');
        const text = Buffer.from(await reply.blob.arrayBuffer()).toString('latin1');
        expect(text.startsWith('%PDF-')).toBe(true);
        expect((text.match(/\/Type \/Page\b/g) || []).length).toBeGreaterThanOrEqual(5);
        expect(text).toMatch(/\/BaseFont \/[A-Z]+\+Roboto/);
    }, 60000);

    it('answers a job it cannot lay out with the error', async () => {
        await startWorker();
        globalThis.onmessage({ data: { model: null, assets: null, origin: ORIGIN } });
        const reply = await answer();
        expect(reply.type).toBe('error');
        expect(typeof reply.message).toBe('string');
    }, 60000);
});
