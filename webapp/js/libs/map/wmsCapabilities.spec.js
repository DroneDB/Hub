import { describe, it, expect } from 'vitest';
import { parseWmsLayers } from './wmsCapabilities';

const CAPS = `<?xml version="1.0"?>
<WMS_Capabilities><Capability><Layer><Title>Root</Title>
  <Layer><Name>ortho</Name><Title>Orthophoto</Title></Layer>
  <Layer><Name>sat</Name><Title>Satellite</Title>
    <Dimension name="time">2026-01-01T00:00:00Z/2026-02-01T00:00:00Z,2026-03-12T12:28:18Z/2026-04-01T00:00:00Z</Dimension>
  </Layer>
  <Layer><Name>dated</Name><Dimension name="TIME" default="2025-05-05"/></Layer>
</Layer></Capability></WMS_Capabilities>`;

describe('parseWmsLayers', () => {
    it('lists named layers with their default time', () => {
        expect(parseWmsLayers(CAPS)).toEqual([
            { name: 'ortho', title: 'Orthophoto', defaultTime: '' },
            { name: 'sat', title: 'Satellite', defaultTime: '2026-03-12T12:28:18Z' },
            { name: 'dated', title: '', defaultTime: '2025-05-05' }
        ]);
    });

    it('rejects documents that are not XML', () => {
        expect(() => parseWmsLayers('<html><body>nope')).toThrow('Invalid XML response from WMS server.');
    });
});
