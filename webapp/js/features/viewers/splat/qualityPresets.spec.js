import { describe, it, expect, vi } from 'vitest';
import { PREF_CHOICES, PREF } from '@/libs/preferences';
import { QUALITY_LEVELS, QUALITY_PRESETS, QUALITY_CHOICES, presetOf, describeQuality, createQualityController } from './qualityPresets';

describe('presets', () => {
    it('map each level to the settings of the four things that decide the cost', () => {
        expect(QUALITY_PRESETS.low).toEqual({ maxSh: 0, lodScale: 0.5, lodSplatScale: 0.25, pixelRatio: 1 });
        expect(QUALITY_PRESETS.medium).toEqual({ maxSh: 1, lodScale: 0.75, lodSplatScale: 0.5, pixelRatio: 1.5 });
        expect(QUALITY_PRESETS.high).toEqual({ maxSh: 3, lodScale: 1, lodSplatScale: 1, pixelRatio: 2 });
        expect(presetOf('medium')).toBe(QUALITY_PRESETS.medium);
    });

    it('go from the cheapest to the dearest on every setting', () => {
        const [low, medium, high] = QUALITY_LEVELS.map(presetOf);
        for (const key of Object.keys(low)) {
            expect(low[key]).toBeLessThan(medium[key]);
            expect(medium[key]).toBeLessThan(high[key]);
        }
    });

    it('keep the pixel ratio within the cap the stage draws at', () => {
        expect(Math.max(...QUALITY_LEVELS.map(l => presetOf(l).pixelRatio))).toBe(2);
    });

    it('are offered with auto first, in the order of the preference values', () => {
        expect(QUALITY_CHOICES.map(c => c.value)).toEqual(PREF_CHOICES[PREF.SPLAT_QUALITY]);
        expect(QUALITY_CHOICES.map(c => c.label)).toEqual(['Auto', 'Low', 'Medium', 'High']);
    });

    it('are described by their label, and in auto by the one in force', () => {
        expect(describeQuality('high', 'low')).toBe('High');
        expect(describeQuality('auto', 'medium')).toBe('Auto (medium)');
    });
});

describe('quality controller', () => {
    const SLOW = 50;
    const FAST = 10;
    function feed(controller, ms, duration) {
        for (let t = 0; t < duration; t += ms) controller.frame(ms);
    }
    function make(setting) {
        const apply = vi.fn();
        const onLevel = vi.fn();
        return { apply, onLevel, controller: createQualityController({ setting, apply, onLevel }) };
    }

    it('puts the preset of a fixed setting in force at the start, and never changes it with the frame times', () => {
        const { controller, apply, onLevel } = make('low');
        controller.start();
        expect(apply).toHaveBeenCalledExactlyOnceWith(QUALITY_PRESETS.low, 'low');
        expect(onLevel).toHaveBeenCalledWith('low');
        feed(controller, SLOW, 10000);
        feed(controller, FAST, 20000);
        expect(apply).toHaveBeenCalledTimes(1);
        expect(controller.level).toBe('low');
    });

    it('starts auto at the highest preset and steps down when the frames are slow', () => {
        const { controller, apply } = make('auto');
        controller.start();
        expect(apply).toHaveBeenLastCalledWith(QUALITY_PRESETS.high, 'high');
        feed(controller, SLOW, 2600);
        expect(apply).toHaveBeenLastCalledWith(QUALITY_PRESETS.medium, 'medium');
        feed(controller, SLOW, 2600);
        expect(apply).toHaveBeenLastCalledWith(QUALITY_PRESETS.low, 'low');
        feed(controller, SLOW, 10000);
        expect(controller.level).toBe('low');
        expect(apply).toHaveBeenCalledTimes(3);
    });

    it('steps up again in auto once the frames are fast', () => {
        const { controller } = make('auto');
        controller.start();
        feed(controller, SLOW, 2600);
        expect(controller.level).toBe('medium');
        feed(controller, FAST, 6000);
        expect(controller.level).toBe('high');
    });

    it('reads a setting that is not a choice as auto', () => {
        for (const bad of [undefined, null, 'ultra', 3]) {
            const { controller } = make(bad);
            expect(controller.setting).toBe('auto');
        }
    });

    it('changes the setting at once, and auto starts over from the top', () => {
        const { controller, apply } = make('auto');
        controller.start();
        feed(controller, SLOW, 2600);
        expect(controller.level).toBe('medium');
        controller.setSetting('high');
        expect(apply).toHaveBeenLastCalledWith(QUALITY_PRESETS.high, 'high');
        controller.setSetting('low');
        expect(controller.level).toBe('low');
        controller.setSetting('auto');
        expect(controller.level).toBe('high');
        // The same setting again is nothing to apply
        const calls = apply.mock.calls.length;
        controller.setSetting('auto');
        expect(apply).toHaveBeenCalledTimes(calls);
    });

    it('applies the preset again on start() (a new scene)', () => {
        const { controller, apply } = make('medium');
        controller.start();
        controller.start();
        expect(apply).toHaveBeenCalledTimes(2);
    });
});
