import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { auditSource, listSources } from '../../../scripts/lib/listenerAudit.mjs';
import rule from '../../../eslint-rules/paired-listeners.mjs';

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

describe('listener audit: pairing', () => {
    const unpaired = src => auditSource(src).unpaired;

    it('pairs per event: a removal of one event does not stand for another', () => {
        const added = [
            "window.addEventListener('resize', a);",
            "window.addEventListener('scroll', b);"
        ];
        expect(unpaired([...added, "window.removeEventListener('resize', a);", "window.removeEventListener('resize', a);"].join('\n'))).toBe(true);
        expect(unpaired([...added, "window.removeEventListener('resize', a);", "window.removeEventListener('scroll', b);"].join('\n'))).toBe(false);
        // The counts alone cannot tell the two apart
        const r = auditSource([...added, "window.removeEventListener('resize', a);", "window.removeEventListener('resize', a);"].join('\n'));
        expect(r.add).toBe(r.rem);
    });

    it('pairs the bus and OpenLayers events per event, and lets an event named by a variable or unByKey cover one', () => {
        expect(unpaired("map.on('click', a);\nmap.on('moveend', b);\nmap.un('click', a);\nmap.un('click', a);")).toBe(true);
        expect(unpaired("map.on('click', a);\nmap.on('moveend', b);\nmap.un('click', a);\nmap.un('moveend', b);")).toBe(false);
        expect(unpaired("const k = map.on('click', a);\nunByKey(k);")).toBe(false);
        expect(unpaired("const k = map.on('click', a);\nmap.on('moveend', b);\nunByKey(k);")).toBe(true);
        expect(unpaired("el.addEventListener(type, a);\nel.removeEventListener(type, a);")).toBe(false);
        expect(unpaired("el.addEventListener(type, a);\nel.addEventListener('x', b);\nel.removeEventListener('x', b);")).toBe(true);
    });

    it('still passes a listener removed under the event it was added with', () => {
        expect(unpaired("el.addEventListener('keydown', f);\nel.removeEventListener('keydown', f);")).toBe(false);
        expect(unpaired("const t = setInterval(f, 1);\nclearInterval(t);")).toBe(false);
        expect(unpaired("setInterval(f, 1);")).toBe(true);
    });
});

describe('listener audit: which files it reads', () => {
    it('reads a checkout whose path contains "vendor" and skips only a folder named vendor', () => {
        const base = fs.mkdtempSync(path.join(os.tmpdir(), 'vendor-checkout-'));
        try {
            const root = path.join(base, 'webapp', 'js');
            fs.mkdirSync(path.join(root, 'libs'), { recursive: true });
            fs.mkdirSync(path.join(root, 'vendor', 'x'), { recursive: true });
            fs.writeFileSync(path.join(root, 'libs', 'a.js'), '');
            fs.writeFileSync(path.join(root, 'libs', 'a.spec.js'), '');
            fs.writeFileSync(path.join(root, 'App.vue'), '');
            fs.writeFileSync(path.join(root, 'vendor', 'x', 'b.js'), '');
            expect(listSources(root).map(f => path.relative(root, f)).sort()).toEqual(['App.vue', path.join('libs', 'a.js')]);
        } finally {
            fs.rmSync(base, { recursive: true, force: true });
        }
    });

    it('the lint rule reports a file whose path contains "vendor" outside the vendored folder', () => {
        const run = filename => {
            const reports = [];
            const handlers = rule.create({ filename, sourceCode: { text: "el.addEventListener('a', f);" }, report: r => reports.push(r) });
            handlers['Program:exit']?.({});
            return reports;
        };
        const sep = path.sep;
        expect(run(['', 'home', 'vendor', 'hub', 'webapp', 'js', 'libs', 'x.js'].join(sep))).toHaveLength(1);
        expect(run(['', 'home', 'hub', 'webapp', 'js', 'vendor', 'x.js'].join(sep))).toHaveLength(0);
    });
});
