import { describe, it, expect } from 'vitest';
import { usesLegacyNexus } from './modelFormat';

const BM3D = { role: 'model.bm3d', url: '/orgs/o/ds/d/build/h/bm3d/model.bm3d' };
const NXZ = { role: 'model.nexus', url: '/orgs/o/ds/d/build/h/nxs/model.nxz' };
const TILES = { role: 'model.3dtiles', url: '/orgs/o/ds/d/build/h/3dtiles/tileset.json' };

describe('usesLegacyNexus', () => {
    it('is true for an entry that lists only the Nexus model', () => {
        expect(usesLegacyNexus({ artifacts: [NXZ] })).toBe(true);
        expect(usesLegacyNexus({ artifacts: [TILES, NXZ] })).toBe(true);
    });

    it('is false for an entry that lists the bm3d model, whatever else it lists', () => {
        expect(usesLegacyNexus({ artifacts: [BM3D] })).toBe(false);
        expect(usesLegacyNexus({ artifacts: [BM3D, TILES] })).toBe(false);
        expect(usesLegacyNexus({ artifacts: [NXZ, BM3D] })).toBe(false);
    });

    it('is false for an entry without a model: the bm3d viewer says it is not available', () => {
        expect(usesLegacyNexus({})).toBe(false);
        expect(usesLegacyNexus({ artifacts: [TILES] })).toBe(false);
        expect(usesLegacyNexus(null)).toBe(false);
    });
});
