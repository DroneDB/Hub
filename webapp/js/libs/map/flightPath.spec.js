import { describe, it, expect } from 'vitest';
import { haversineMeters, orderFlightPath } from './flightPath';

describe('haversineMeters', () => {
    it('measures one degree of latitude as about 111 km', () => {
        expect(haversineMeters([0, 0], [0, 1])).toBeCloseTo(111195, -1);
    });
});

describe('orderFlightPath', () => {
    // t in seconds; captureTime is DroneDB's epoch milliseconds
    const at = (lat, t, flightSpeed) => ({ coords: [0, lat], captureTime: 1.7e12 + t * 1000, flightSpeed });

    it('orders by capture time', () => {
        const { ordered } = orderFlightPath([at(0.002, 20), at(0, 0), at(0.001, 10)]);
        expect(ordered.map(s => (s.captureTime - 1.7e12) / 1000)).toEqual([0, 10, 20]);
    });

    it('prefers the recorded speed, else distance over time', () => {
        const { speeds } = orderFlightPath([at(0, 0), at(0.0001, 1), at(0.0002, 2, 4.5)]);
        expect(speeds[0]).toBeNull();
        expect(speeds[1]).toBeCloseTo(11.12, 1);
        expect(speeds[2]).toBe(4.5);
    });

    it('drops gaps over 5 minutes and speeds over 200 km/h', () => {
        const { speeds } = orderFlightPath([at(0, 0), at(0.0001, 400), at(0.01, 401)]);
        expect(speeds).toEqual([null, null, null]);
    });
});
