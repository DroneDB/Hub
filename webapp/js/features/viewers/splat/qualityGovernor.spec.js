import { describe, it, expect } from 'vitest';
import { initialGovernor, stepGovernor, GOVERNOR_DEFAULTS } from './qualityGovernor';

/** Feeds frames of `frameMs` for `durationMs`; returns the state and the changes made on the way. */
function run(state, frameMs, durationMs) {
    const changes = [];
    let elapsed = 0;
    while (elapsed < durationMs) {
        const step = stepGovernor(state, frameMs);
        state = step.state;
        if (step.change) changes.push({ change: step.change, at: elapsed + frameMs, level: state.level });
        elapsed += frameMs;
    }
    return { state, changes };
}

const SLOW = 1000 / 20;  // 20 fps
const FAST = 1000 / 60;  // 60 fps
const OKAY = 1000 / 40;  // 40 fps: between the two thresholds

describe('stepping down', () => {
    it('lowers the level one step after about 2 s under 30 fps', () => {
        const { state, changes } = run(initialGovernor(2), SLOW, 3000);
        expect(changes[0]).toMatchObject({ change: -1, level: 1 });
        // The smoothed frame time has to cross the threshold first, then 2 s have to pass
        expect(changes[0].at).toBeGreaterThanOrEqual(GOVERNOR_DEFAULTS.downAfterMs);
        expect(changes[0].at).toBeLessThan(GOVERNOR_DEFAULTS.downAfterMs + 500);
        expect(state.level).toBe(1);
    });

    it('does not step down before the hold time', () => {
        expect(run(initialGovernor(2), SLOW, 1900).changes).toEqual([]);
    });

    it('goes down again after another 2 s, and stops at the lowest level', () => {
        const { state, changes } = run(initialGovernor(2), SLOW, 10000);
        expect(changes.map(c => c.level)).toEqual([1, 0]);
        expect(state.level).toBe(0);
    });

    it('does not count a lone hitch as a slow scene', () => {
        let state = initialGovernor(2);
        let changes = 0;
        // A 300 ms frame every half second on a scene that runs at 60 fps
        for (let second = 0; second < 20; second++) {
            for (let i = 0; i < 30; i++) {
                const step = stepGovernor(state, i === 0 ? 300 : FAST);
                state = step.state;
                changes += Math.abs(step.change);
            }
        }
        expect(changes).toBe(0);
        expect(state.level).toBe(2);
    });

    it('needs the slowness to last: a good stretch in between starts the wait again', () => {
        let state = initialGovernor(2);
        for (let round = 0; round < 10; round++) {
            state = run(state, SLOW, 1500).state;
            state = run(state, FAST, 1500).state;
        }
        expect(state.level).toBe(2);
    });
});

describe('stepping up', () => {
    it('raises the level one step after about 5 s over 55 fps', () => {
        expect(run(initialGovernor(2), FAST, 6000).changes).toEqual([]);   // already at the top
        const up = run({ ...initialGovernor(2), level: 0 }, FAST, 6000);
        expect(up.changes[0]).toMatchObject({ change: 1, level: 1 });
        expect(up.changes[0].at).toBeGreaterThanOrEqual(GOVERNOR_DEFAULTS.upAfterMs);
        expect(up.changes[0].at).toBeLessThan(GOVERNOR_DEFAULTS.upAfterMs + 500);
    });

    it('waits longer to go up than to go down', () => {
        expect(GOVERNOR_DEFAULTS.upAfterMs).toBeGreaterThan(GOVERNOR_DEFAULTS.downAfterMs);
        const lowered = { ...initialGovernor(2), level: 0 };
        expect(run(lowered, FAST, 4500).changes).toEqual([]);
    });

    it('stops at the highest level', () => {
        const { state, changes } = run({ ...initialGovernor(2), level: 0 }, FAST, 30000);
        expect(changes.map(c => c.level)).toEqual([1, 2]);
        expect(state.level).toBe(2);
    });
});

describe('hysteresis', () => {
    it('holds the level between 30 and 55 fps for as long as it lasts', () => {
        const { state, changes } = run({ ...initialGovernor(2), level: 1 }, OKAY, 60000);
        expect(changes).toEqual([]);
        expect(state.level).toBe(1);
    });

    it('does not carry a wait across the band: slow, then in between, then slow again starts over', () => {
        let state = { ...initialGovernor(2) };
        state = run(state, SLOW, 1500).state;
        state = run(state, OKAY, 1500).state;
        const { changes } = run(state, SLOW, 1500);
        expect(changes).toEqual([]);
    });

    it('does not offer again a level that proved too much: a drop soon after a rise lowers the ceiling', () => {
        let state = { ...initialGovernor(2), level: 1 };
        // Fast enough to go up to 2...
        let step = run(state, FAST, 6000);
        expect(step.state.level).toBe(2);
        // ...but too slow there: back to 1, and 2 is not tried again
        step = run(step.state, SLOW, 4000);
        expect(step.state.level).toBe(1);
        expect(step.state.ceiling).toBe(1);
        step = run(step.state, FAST, 20000);
        expect(step.state.level).toBe(1);
        expect(step.changes).toEqual([]);
    });

    it('keeps the ceiling when the drop comes long after the rise', () => {
        let state = run({ ...initialGovernor(2), level: 1 }, FAST, 6000).state;
        expect(state.level).toBe(2);
        // A long calm stretch (still between the thresholds), then a slowdown
        state = run(state, OKAY, GOVERNOR_DEFAULTS.retryUpMs + 1000).state;
        state = run(state, SLOW, 4000).state;
        expect(state.level).toBe(1);
        expect(state.ceiling).toBe(2);
    });
});

describe('frames that measure nothing', () => {
    it('ignores a frame without a time', () => {
        const state = initialGovernor(2);
        for (const bad of [0, -5, NaN, undefined]) expect(stepGovernor(state, bad)).toEqual({ state, change: 0 });
    });

    it('does not count a hidden tab (a frame of a second or more) and forgets the slowness before it', () => {
        let state = run(initialGovernor(2), SLOW, 1800).state;
        expect(state.slowMs).toBeGreaterThan(0);
        const paused = stepGovernor(state, 5000);
        expect(paused.change).toBe(0);
        expect(paused.state).toMatchObject({ slowMs: 0, fastMs: 0, frameMs: null, level: 2 });
        // The wait starts over after the pause
        expect(run(paused.state, SLOW, 1500).changes).toEqual([]);
    });

    it('restarts the measurement after a change, so the frames at the old level do not count at the new one', () => {
        let state = initialGovernor(2);
        let step;
        do {
            step = stepGovernor(state, SLOW);
            state = step.state;
        } while (step.change === 0);
        expect(step.change).toBe(-1);
        expect(state).toMatchObject({ level: 1, slowMs: 0, fastMs: 0, frameMs: null });
    });
});

describe('options', () => {
    it('take other thresholds and hold times', () => {
        const options = { slowFps: 50, downAfterMs: 500 };
        let state = initialGovernor(2);
        const changes = [];
        for (let t = 0; t < 1500; t += 25) {
            const step = stepGovernor(state, 25, options);
            state = step.state;
            if (step.change) changes.push(step.change);
        }
        expect(changes[0]).toBe(-1);
    });
});
