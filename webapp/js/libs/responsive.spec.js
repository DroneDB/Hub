/**
 * deviceMemoryGb (FR-XC-18, NFR-003): the one memory budget of the 3D viewers, 4 GB when the
 * browser gives no value.
 */
import { describe, it, expect } from 'vitest';
import { deviceMemoryGb, reportsDeviceMemory, DEFAULT_DEVICE_MEMORY_GB } from './responsive';

describe('deviceMemoryGb', () => {
    it('is 4 GB for a browser that gives no value', () => {
        expect(DEFAULT_DEVICE_MEMORY_GB).toBe(4);
        expect(deviceMemoryGb({})).toBe(4);
        expect(deviceMemoryGb(undefined)).toBe(deviceMemoryGb(globalThis.navigator));
        expect(deviceMemoryGb(null)).toBe(4);
    });

    it('is 4 GB for a value that is not a usable amount', () => {
        [0, -2, NaN, Infinity, '8', null].forEach(deviceMemory => expect(deviceMemoryGb({ deviceMemory })).toBe(4));
    });

    it('is what the browser reports otherwise', () => {
        expect(deviceMemoryGb({ deviceMemory: 8 })).toBe(8);
        expect(deviceMemoryGb({ deviceMemory: 2 })).toBe(2);
        expect(deviceMemoryGb({ deviceMemory: 0.5 })).toBe(0.5);
    });

    it('reads the global navigator by default', () => {
        const nav = globalThis.navigator;
        const had = Object.getOwnPropertyDescriptor(nav, 'deviceMemory');
        Object.defineProperty(nav, 'deviceMemory', { value: 8, configurable: true });
        try {
            expect(deviceMemoryGb()).toBe(8);
        } finally {
            if (had) Object.defineProperty(nav, 'deviceMemory', had);
            else delete nav.deviceMemory;
        }
        expect(deviceMemoryGb()).toBe(nav.deviceMemory > 0 ? nav.deviceMemory : 4);
    });
});

describe('reportsDeviceMemory', () => {
    it('says whether the browser gave a usable amount', () => {
        expect(reportsDeviceMemory({ deviceMemory: 4 })).toBe(true);
        expect(reportsDeviceMemory({ deviceMemory: 0.25 })).toBe(true);
        [undefined, 0, -2, NaN, Infinity, '8', null].forEach(deviceMemory => expect(reportsDeviceMemory({ deviceMemory })).toBe(false));
        expect(reportsDeviceMemory({})).toBe(false);
        expect(reportsDeviceMemory(null)).toBe(false);
    });
});
