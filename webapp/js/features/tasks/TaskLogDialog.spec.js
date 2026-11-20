/**
 * TaskLogDialog (FR-EXP-26): the "[HH:mm:ss]" the Registry writes at the start of each log line is
 * UTC (LogRingBuffer); the dialog shows it in local time, as the task table shows its dates.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import TaskLogDialog from './TaskLogDialog.vue';
import { formatTime } from '@/libs/format';

let wrapper;
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
    vi.useRealTimers();
});

async function show(logText) {
    wrapper = mount(TaskLogDialog, {
        props: { visible: true, title: 'Build', logText },
        attachTo: document.body,
        global: { plugins: [PrimeVue] }
    });
    await flushPromises();
    return document.querySelector('.task-log').textContent;
}

describe('TaskLogDialog', () => {
    it('shows the UTC time at the start of each line in local time', async () => {
        vi.useFakeTimers({ now: Date.UTC(2026, 10, 9, 12, 0, 0), toFake: ['Date'] });
        const text = await show('[10:15:30] Started\n[10:16:01] Done: [12:00:00] stays\nno time here');
        expect(text).toBe([
            `[${formatTime(Date.UTC(2026, 10, 9, 10, 15, 30))}] Started`,
            `[${formatTime(Date.UTC(2026, 10, 9, 10, 16, 1))}] Done: [12:00:00] stays`,
            'no time here'
        ].join('\n'));
    });

    it('says there is no output for an empty log', async () => {
        expect(await show('')).toBe('No log output.');
    });
});

describe('TaskLogDialog window (FR-PRC-44)', () => {
    it('is the window of a log with a maximize button', async () => {
        await show('line');
        const dialog = document.querySelector('#task-log');
        expect(dialog.classList.contains('dialog-log')).toBe(true);
        expect(dialog.getAttribute('style') || '').not.toContain('--window-width');
        expect(dialog.querySelector('.p-dialog-maximize-button')).not.toBeNull();
    });

    it('wraps lines by default and keeps a line whole with Wrap lines off', async () => {
        await show('x'.repeat(1000));
        const log = document.querySelector('.task-log');
        expect(log.classList.contains('no-wrap')).toBe(false);
        const label = [...document.querySelectorAll('label')].find(l => l.textContent === 'Wrap lines');
        expect(label).toBeDefined();
        const input = document.getElementById(label.getAttribute('for'));
        input.click();
        await flushPromises();
        expect(log.classList.contains('no-wrap')).toBe(true);
        input.click();
        await flushPromises();
        expect(log.classList.contains('no-wrap')).toBe(false);
    });
});

/**
 * The log is the last lines of a task (the Registry keeps a ring of them): once full, a refresh drops lines at its
 * head as it adds lines at its end, and the text keeps its length. jsdom has no layout: each line is LINE px high,
 * and the log VIEW px.
 */
describe('TaskLogDialog auto-scroll', () => {
    const LINE = 20;
    const VIEW = 200;
    const lines = (from, to) => Array.from({ length: to - from }, (_, i) => `line ${from + i}`).join('\n');

    function stubLayout(log) {
        let top = 0;
        Object.defineProperty(log, 'scrollTop', { configurable: true, get: () => top, set: v => { top = Math.max(0, Math.min(v, log.scrollHeight - VIEW)); } });
        Object.defineProperty(log, 'scrollHeight', { configurable: true, get: () => log.textContent.split('\n').length * LINE });
        Object.defineProperty(log, 'clientHeight', { configurable: true, get: () => VIEW });
    }

    async function open(logText) {
        // The top of a character: the line it is on (the text before it, its "\n"s)
        vi.spyOn(Range.prototype, 'getClientRects').mockImplementation(function () {
            const before = this.startContainer.textContent.slice(0, this.startOffset);
            return [{ top: before.split('\n').length * LINE - LINE }];
        });
        wrapper = mount(TaskLogDialog, {
            props: { visible: true, title: 'Build', logText, isActive: true },
            attachTo: document.body,
            global: { plugins: [PrimeVue] }
        });
        await flushPromises();
        const log = document.querySelector('.task-log');
        stubLayout(log);
        return log;
    }

    async function scrollTo(log, top) {
        log.scrollTop = top;
        log.dispatchEvent(new Event('scroll'));
        await flushPromises();
    }

    function toggle(name) {
        const label = [...document.querySelectorAll('label')].find(l => l.textContent === name);
        document.getElementById(label.getAttribute('for')).click();
        return flushPromises();
    }

    afterEach(() => vi.restoreAllMocks());

    it('follows the end of a full log', async () => {
        const log = await open(lines(0, 100));
        await scrollTo(log, log.scrollHeight);
        await wrapper.setProps({ logText: lines(10, 110) });
        await flushPromises();
        expect(log.scrollTop).toBe(100 * LINE - VIEW);
    });

    it('keeps the lines in view when Auto-scroll is off, though the full log drops lines', async () => {
        const log = await open(lines(0, 100));
        await scrollTo(log, log.scrollHeight);
        await toggle('Auto-scroll');
        const top = log.scrollTop; // line 90 at the top
        await wrapper.setProps({ logText: lines(10, 110) });
        await flushPromises();
        expect(log.scrollTop).toBe(top - 10 * LINE); // line 90 still at the top
    });

    it('keeps the lines in view when the user scrolled up', async () => {
        const log = await open(lines(0, 100));
        await scrollTo(log, 40 * LINE);
        await wrapper.setProps({ logText: lines(5, 105) });
        await flushPromises();
        expect(log.scrollTop).toBe(35 * LINE);
    });

    it('does not move a log that only grows when it does not follow', async () => {
        const log = await open(lines(0, 50));
        await scrollTo(log, 10 * LINE);
        await wrapper.setProps({ logText: lines(0, 60) });
        await flushPromises();
        expect(log.scrollTop).toBe(10 * LINE);
    });

    it('goes to the end when Auto-scroll is turned on, and follows it again', async () => {
        const log = await open(lines(0, 100));
        await toggle('Auto-scroll');
        await scrollTo(log, 0);
        await toggle('Auto-scroll');
        expect(log.scrollTop).toBe(100 * LINE - VIEW);
        await wrapper.setProps({ logText: lines(0, 120) });
        await flushPromises();
        expect(log.scrollTop).toBe(120 * LINE - VIEW);
    });
});
