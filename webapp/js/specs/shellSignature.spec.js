/**
 * The page the server sends on every Hub route (the sign-in page included) carries one fixed
 * marker in its head. It must be there before any script runs and on branded deployments too,
 * and it must stay invisible: a branded Hub shows no trace of it.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const html = fs.readFileSync(path.join(ROOT, 'webapp', 'public', 'index.html'), 'utf8');
const SIGNATURE = '<meta name="hub-shell" content="hs-6af916c1c37b">';

describe('Hub shell signature', () => {
    it('is in the static head exactly once, with the fixed value', () => {
        expect(html.split(SIGNATURE).length - 1).toBe(1);
        const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));
        expect(head).toContain(SIGNATURE);
    });

    it('is plain markup, not written by a script', () => {
        const scripts = html.match(/<script[\s\S]*?<\/script>/g) || [];
        expect(scripts.some(s => s.includes('hub-shell'))).toBe(false);
    });

    it('adds nothing visible: the body text and the title do not name it', () => {
        const body = html.slice(html.indexOf('<body>'));
        expect(body).not.toContain('hs-6af916c1c37b');
        expect(html).toContain('<title>Hub</title>');
    });
});
