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
    it('is the wide window with a maximize button', async () => {
        await show('line');
        const dialog = document.querySelector('#task-log');
        expect(dialog.classList.contains('dialog-wide')).toBe(true);
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
