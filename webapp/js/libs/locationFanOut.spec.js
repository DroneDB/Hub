import { describe, it, expect, vi, afterEach } from 'vitest';
import { createLocationFanOut, LOCATION_REQUESTS } from './locationFanOut';

const orgs = n => Array.from({ length: n }, (_, i) => ({ slug: `o${i}`, name: i % 2 ? `Org ${i}` : null }));

/** A fetch whose answers the test settles by hand, one request at a time. */
function manualFetch() {
    const pending = [];
    const fetchLocations = vi.fn((org, { signal }) => new Promise((resolve, reject) => {
        const request = { org, signal, resolve, reject };
        signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        pending.push(request);
    }));
    const requestOf = org => pending.findLast(r => r.org === org);
    return { fetchLocations, pending, requestOf };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const fanOut = (fetchLocations, onChange = vi.fn()) => createLocationFanOut({ fetchLocations, onChange });
const shown = run => run.groups.map(g => g.org);

afterEach(() => vi.restoreAllMocks());

describe('createLocationFanOut', () => {
    it('asks four organizations at a time and starts the next as one answers', async () => {
        const { fetchLocations, pending } = manualFetch();
        const run = fanOut(fetchLocations);
        run.update(orgs(7));
        await tick();
        expect(LOCATION_REQUESTS).toBe(4);
        expect(fetchLocations).toHaveBeenCalledTimes(4);

        pending[0].resolve([]);
        await tick();
        expect(fetchLocations).toHaveBeenCalledTimes(5);
        expect(run.groups).toHaveLength(1);
    });

    it('hands each answer over as it arrives, with the name of the organization or its slug', async () => {
        const { fetchLocations, pending } = manualFetch();
        const onChange = vi.fn();
        const run = fanOut(fetchLocations, onChange);
        run.update(orgs(2));
        expect(run.loading).toBe(true);
        await tick();
        onChange.mockClear();
        pending[1].resolve([{ slug: 'x', name: null, bbox: [1, 2, 3, 4] }]);
        await tick();
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(run.groups).toEqual([{ org: 'o1', orgName: 'Org 1', datasets: [{ slug: 'x', name: null, bbox: [1, 2, 3, 4] }] }]);
        expect(run.loading).toBe(true);
        pending[0].resolve([]);
        await tick();
        expect(run.groups.map(g => g.orgName)).toEqual(['Org 1', 'o0']);
        expect(run.loading).toBe(false);
    });

    it('skips an organization that fails, quietly, and goes on with the others', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const fetchLocations = vi.fn(async org => {
            if (org === 'o1') throw Object.assign(new Error('Forbidden'), { status: 403 });
            return [];
        });
        const run = fanOut(fetchLocations);
        run.update(orgs(3));
        await tick();
        expect(shown(run)).toEqual(['o0', 'o2']);
        expect(run.loading).toBe(false);
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('stopping ends the requests in flight, starts none that is queued and drops late answers', async () => {
        const { fetchLocations, pending } = manualFetch();
        const run = fanOut(fetchLocations);
        run.update(orgs(10));
        await tick();
        pending[0].resolve([]);
        await tick();
        expect(fetchLocations).toHaveBeenCalledTimes(5);

        run.stop();
        expect(pending.every(r => r.signal.aborted)).toBe(true);
        expect(run.groups).toEqual([]);
        expect(run.loading).toBe(false);
        await tick();
        expect(fetchLocations).toHaveBeenCalledTimes(5);
        expect(run.groups).toEqual([]);
    });

    it('drops an answer that arrives after its organization left the set, even from a fetch that ignores the signal', async () => {
        let answer;
        const run = fanOut(() => new Promise(resolve => { answer = resolve; }));
        run.update(orgs(1));
        await tick();
        run.stop();
        answer([{ slug: 'late', name: 'Late', bbox: [1, 1, 2, 2] }]);
        await tick();
        expect(run.groups).toEqual([]);
        expect(run.loading).toBe(false);
    });

    it('does not log an ended request as a failure', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { fetchLocations } = manualFetch();
        const run = fanOut(fetchLocations);
        run.update(orgs(2));
        await tick();
        run.stop();
        await tick();
        expect(warn).not.toHaveBeenCalled();
    });

    it('asks only for the organizations a new set brings in, and keeps the answers and requests of those still in it', async () => {
        const { fetchLocations, requestOf } = manualFetch();
        const run = fanOut(fetchLocations);
        run.update([{ slug: 'a' }, { slug: 'b' }]);
        await tick();
        requestOf('a').resolve([]);
        await tick();

        run.update([{ slug: 'b' }, { slug: 'a' }, { slug: 'c' }]);
        await tick();
        expect(fetchLocations.mock.calls.map(([org]) => org)).toEqual(['a', 'b', 'c']);
        expect(requestOf('b').signal.aborted).toBe(false);
        expect(shown(run)).toEqual(['a']);
        requestOf('b').resolve([]);
        await tick();
        expect(shown(run)).toEqual(['a', 'b']);
    });

    it('ends the request of each organization a new set leaves out, and only that one', async () => {
        const { fetchLocations, requestOf } = manualFetch();
        const run = fanOut(fetchLocations);
        run.update([{ slug: 'a' }, { slug: 'b' }, { slug: 'c' }]);
        await tick();
        requestOf('a').resolve([]);
        await tick();

        run.update([{ slug: 'c' }]);
        expect(requestOf('a').signal.aborted).toBe(true);
        expect(requestOf('b').signal.aborted).toBe(true);
        expect(requestOf('c').signal.aborted).toBe(false);
        expect(run.groups).toEqual([]);
        expect(run.loading).toBe(true);
        requestOf('c').resolve([]);
        await tick();
        expect(shown(run)).toEqual(['c']);
        expect(run.loading).toBe(false);
    });

    it('keepOnly drops the organizations left out and asks for none', async () => {
        const { fetchLocations, requestOf } = manualFetch();
        const run = fanOut(fetchLocations);
        run.update([{ slug: 'a' }, { slug: 'b' }]);
        await tick();
        run.keepOnly([{ slug: 'b' }, { slug: 'new' }]);
        await tick();
        expect(fetchLocations).toHaveBeenCalledTimes(2);
        expect(requestOf('a').signal.aborted).toBe(true);
        expect(requestOf('b').signal.aborted).toBe(false);
    });

    it('drops the first answer of an organization that left the set and came back while it was asked, and asks again', async () => {
        // A fetch that ignores the signal, so the first answer does arrive
        const answers = [];
        const fetchLocations = vi.fn((org, { signal }) => new Promise(resolve => { answers.push({ signal, resolve }); }));
        const run = fanOut(fetchLocations);
        run.update([{ slug: 'a' }]);
        await tick();
        run.update([]);
        run.update([{ slug: 'a' }]);
        await tick();
        expect(fetchLocations).toHaveBeenCalledTimes(2);
        const [first, second] = answers;
        expect(second.signal).not.toBe(first.signal);
        expect(first.signal.aborted).toBe(true);
        expect(second.signal.aborted).toBe(false);

        first.resolve([{ slug: 'old', name: 'Old', bbox: [1, 1, 2, 2] }]);
        await tick();
        expect(run.groups).toEqual([]);
        expect(run.loading).toBe(true);

        second.resolve([{ slug: 'new', name: 'New', bbox: [3, 3, 4, 4] }]);
        await tick();
        expect(run.groups).toEqual([{ org: 'a', orgName: 'a', datasets: [{ slug: 'new', name: 'New', bbox: [3, 3, 4, 4] }] }]);
        expect(run.loading).toBe(false);
        expect(second.signal.aborted).toBe(false);
    });

    it('asks again for an organization that left the set and came back', async () => {
        const { fetchLocations, pending } = manualFetch();
        const run = fanOut(fetchLocations);
        run.update([{ slug: 'a' }]);
        await tick();
        pending[0].resolve([]);
        await tick();
        run.update([]);
        run.update([{ slug: 'a' }]);
        await tick();
        expect(fetchLocations).toHaveBeenCalledTimes(2);
        expect(pending[1].signal.aborted).toBe(false);
        expect(run.groups).toEqual([]);
    });
});
