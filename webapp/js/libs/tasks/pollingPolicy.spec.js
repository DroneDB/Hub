/**
 * Unit tests for libs/tasks/pollingPolicy.js and libs/sse.js
 * Run with: npx vitest run webapp/js/libs/tasks/pollingPolicy.spec.js
 */
import { describe, it, expect, vi } from 'vitest';
import { nextPollDelay, POLL_ACTIVE_MS, POLL_IDLE_MS, POLL_MAX_MS } from './pollingPolicy';
import { createEventParser, openEventStream } from '@/libs/sse';
import { onTick } from '@/libs/clock';

describe('nextPollDelay', () => {
    it('never polls a hidden page', () => {
        expect(nextPollDelay({ hidden: true, active: true, idleStreak: 0 })).toBeNull();
    });
    it('polls fast while tasks run, then backs off while nothing changes', () => {
        expect(nextPollDelay({ hidden: false, active: true, idleStreak: 9 })).toBe(POLL_ACTIVE_MS);
        expect(nextPollDelay({ hidden: false, active: false, idleStreak: 0 })).toBe(POLL_IDLE_MS);
        expect(nextPollDelay({ hidden: false, active: false, idleStreak: 1 })).toBe(2 * POLL_IDLE_MS);
        expect(nextPollDelay({ hidden: false, active: false, idleStreak: 10 })).toBe(POLL_MAX_MS);
    });
    it('only keeps a safety-net poll while change notifications are connected', () => {
        expect(nextPollDelay({ hidden: false, active: false, idleStreak: 0, pushed: true })).toBe(POLL_MAX_MS);
    });
});

describe('server-sent events', () => {
    it('parses events split across chunks and ignores comments', () => {
        const events = [];
        const parser = createEventParser(e => events.push(e));
        parser.push('retry: 5000\n\n: ping\n\nid: 1\nevent: ta');
        parser.push('sks\ndata: {}\n\n');
        parser.push('data: a\r\ndata: b\r\n\r\n');
        expect(events).toEqual([
            { type: 'tasks', data: '{}', id: '1' },
            { type: 'message', data: 'a\nb', id: '1' }
        ]);
    });

    it('reads a stream, sends the token, and reports its end', async () => {
        const body = new ReadableStream({
            start(c) {
                c.enqueue(new TextEncoder().encode('event: tasks\ndata: {}\n\n'));
                c.close();
            }
        });
        const fetchImpl = vi.fn(async () => new Response(body, { status: 200 }));
        const onEvent = vi.fn(), onOpen = vi.fn(), onClose = vi.fn();
        await openEventStream({ url: 'http://hub/e', headers: { Authorization: 'Bearer t' }, fetchImpl, onEvent, onOpen, onClose });
        expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer t');
        expect(onOpen).toHaveBeenCalled();
        expect(onEvent).toHaveBeenCalledWith({ type: 'tasks', data: '{}', id: undefined });
        expect(onClose).toHaveBeenCalledWith(undefined);
    });
});

describe('shared clock', () => {
    it('runs one interval for any number of listeners and stops with the last', () => {
        vi.useFakeTimers();
        const spy = vi.spyOn(globalThis, 'setInterval');
        const a = vi.fn(), b = vi.fn();
        const stopA = onTick(a);
        const stopB = onTick(b);
        vi.advanceTimersByTime(1000);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(a).toHaveBeenCalledTimes(1);
        expect(b).toHaveBeenCalledTimes(1);
        stopA(); stopB();
        vi.advanceTimersByTime(3000);
        expect(a).toHaveBeenCalledTimes(1);
        spy.mockRestore();
        vi.useRealTimers();
    });
});
