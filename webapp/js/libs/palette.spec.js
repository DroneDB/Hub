/**
 * The brand blue in palette.js is the source; the stylesheets keep a copy of it that must not
 * drift, and canvas code gets it as rgba strings.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PRIMARY, primaryRgba, ANALYSIS_YELLOW, hexRgba } from './palette';

const WEBAPP = path.resolve(__dirname, '../..');
const variables = fs.readFileSync(path.join(WEBAPP, 'css/_variables.scss'), 'utf8');

const SHADES = Object.keys(PRIMARY);

describe('the brand blue', () => {
    it('has the shades 50 to 950', () => {
        expect(SHADES.map(Number)).toEqual([50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]);
    });

    it('cannot be changed at run time', () => {
        expect(Object.isFrozen(PRIMARY)).toBe(true);
    });

    it.each(SHADES)('is held equal by --ddb-primary-%s in _variables.scss', shade => {
        expect(variables).toMatch(new RegExp(`--ddb-primary-${shade}:\\s*${PRIMARY[shade]};`, 'i'));
    });

    it('is held equal by --ddb-primary-rgb, the triplet of shade 500', () => {
        const triplet = primaryRgba(1).match(/rgba\((\d+), (\d+), (\d+), 1\)/).slice(1).join(', ');
        expect(variables).toMatch(new RegExp(`--ddb-primary-rgb:\\s*${triplet};`));
    });

    it('is the primary and hover colour of the stylesheets', () => {
        expect(variables).toMatch(/--ddb-primary:\s*var\(--ddb-primary-500\);/);
        expect(variables).toMatch(/--ddb-primary-hover:\s*var\(--ddb-primary-600\);/);
    });

    it('is the colour of the boot spinner in index.html, drawn before the stylesheets load', () => {
        const index = fs.readFileSync(path.join(WEBAPP, 'public/index.html'), 'utf8');
        const spinner = index.match(/#main-loading\s*\{([^}]*)\}/)[1];
        expect(spinner).toMatch(new RegExp(`border-top:\\s*4px solid ${PRIMARY[500]};`, 'i'));
    });

    it('gives canvas colours with an alpha', () => {
        expect(primaryRgba(0.25)).toBe('rgba(0, 112, 224, 0.25)');
        expect(primaryRgba(0.5, 700)).toBe('rgba(0, 74, 149, 0.5)');
    });
});

describe('the analysis yellow', () => {
    const panels = fs.readFileSync(path.join(WEBAPP, 'css/_analysis-panel.scss'), 'utf8');

    it('is held equal by the stockpile panel accent and the panel warning', () => {
        const stockpile = panels.match(/\.analysis-panel--stockpile\s*\{([^}]*)\}/)[1];
        expect(stockpile).toMatch(new RegExp(`--panel-accent:\\s*${ANALYSIS_YELLOW};`, 'i'));
        expect(panels).toMatch(new RegExp(`--panel-warn:\\s*${ANALYSIS_YELLOW};`, 'i'));
    });

    it('gives canvas colours with an alpha', () => {
        expect(hexRgba(ANALYSIS_YELLOW, 0.2)).toBe('rgba(255, 213, 79, 0.2)');
    });
});

describe('the palette module', () => {
    it('imports no UI framework, so map and viewer code stay free of the PrimeVue preset', () => {
        const source = fs.readFileSync(path.join(__dirname, 'palette.js'), 'utf8');
        expect(source).not.toMatch(/^\s*import\b/m);
    });
});
