import { describe, it, expect } from 'vitest';
import { auditSource } from '../../../scripts/lib/listenerAudit.mjs';

describe('listener audit', () => {
    it('counts an OpenLayers key that is never removed', () => {
        expect(auditSource("map.on('click', fn);").unpaired).toBe(true);
    });

    it('exempts registrations inside a helper call that spans lines', () => {
        const src = [
            'this.listeners.ol([',
            "    map.on('click', a),",
            "    map.on('dblclick', b)",
            ']);',
            "map.on('pointermove', c);"
        ].join('\n');
        const r = auditSource(src);
        expect(r.on).toBe(1);
        expect(auditSource(src.split('\n').slice(0, 4).join('\n')).unpaired).toBe(false);
    });
});
