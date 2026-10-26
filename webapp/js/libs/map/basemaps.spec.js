import { describe, it, expect, beforeEach } from 'vitest';
import { getAttributionFromUrl, isAbsoluteHttpUrl, getCustomBasemapConfig, saveCustomBasemapConfig, Basemaps } from './basemaps';
import { PREF, setPref, getPref } from '@/libs/preferences';

beforeEach(() => localStorage.clear());

const store = config => setPref(PREF.CUSTOM_BASEMAP, config);
const XYZ = { sourceType: 'xyz', url: 'https://tiles.example.com/{z}/{x}/{y}.png', layerName: '' };
const WMS = { sourceType: 'wms', url: 'https://maps.example.org/wms', layerName: 'ortho' };

describe('getAttributionFromUrl', () => {
    it('is the copyright sign and the host', () => {
        expect(getAttributionFromUrl('https://tiles.example.com/{z}/{x}/{y}.png')).toBe('&copy; tiles.example.com');
    });

    it('is empty when the URL cannot be parsed', () => {
        expect(getAttributionFromUrl('not a url')).toBe('');
        expect(getAttributionFromUrl('/relative/{z}')).toBe('');
    });
});

describe('getCustomBasemapConfig', () => {
    it('is null when nothing is stored', () => {
        expect(getCustomBasemapConfig()).toBeNull();
    });

    it('accepts http and https XYZ and WMS sources', () => {
        store(XYZ);
        expect(getCustomBasemapConfig()).toMatchObject({ sourceType: 'xyz', url: XYZ.url });
        store({ ...XYZ, url: 'http://tiles.example.com/{z}/{x}/{y}.png' });
        expect(getCustomBasemapConfig()).not.toBeNull();
        store(WMS);
        expect(getCustomBasemapConfig()).toMatchObject({ sourceType: 'wms', layerName: 'ortho' });
    });

    it.each([
        'javascript:alert(1)',
        'JaVaScRiPt:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'file:///etc/passwd',
        'ftp://tiles.example.com/{z}/{x}/{y}.png',
        '//tiles.example.com/{z}/{x}/{y}.png',
        '/tiles/{z}/{x}/{y}.png',
        'tiles/{z}/{x}/{y}.png',
        '',
        ' '
    ])('rejects the URL %j', url => {
        store({ ...XYZ, url });
        expect(getCustomBasemapConfig()).toBeNull();
    });

    it.each([undefined, null, 5, {}, ['https://x.test']])('rejects the non-string URL %j', url => {
        store({ ...XYZ, url });
        expect(getCustomBasemapConfig()).toBeNull();
    });

    it.each(['tms', 'WMS', 'XYZ', '', null, 3, undefined])('rejects the source type %j', sourceType => {
        store({ ...XYZ, sourceType });
        expect(getCustomBasemapConfig()).toBeNull();
    });

    it('rejects values that are not objects', () => {
        for (const raw of ['"https://x.test"', '5', 'true', '[1]']) {
            localStorage.setItem(PREF.CUSTOM_BASEMAP, raw);
            expect(getCustomBasemapConfig()).toBeNull();
        }
    });

    it('a WMS source without a layer draws nothing: null', () => {
        store({ ...WMS, layerName: '' });
        expect(getCustomBasemapConfig()).toBeNull();
        store({ sourceType: 'wms', url: WMS.url });
        expect(getCustomBasemapConfig()).toBeNull();
    });

    it('recomputes the attribution from the URL, whatever is stored (it is rendered as HTML)', () => {
        store({ ...XYZ, attribution: '<img src=x onerror=alert(1)>' });
        expect(getCustomBasemapConfig().attribution).toBe('&copy; tiles.example.com');
    });

    it('fills the optional fields with safe values', () => {
        store({ ...XYZ, tileSize: 9999, defaultTime: 5, wmsLayers: 'x' });
        expect(getCustomBasemapConfig()).toMatchObject({ tileSize: 256, defaultTime: '', wmsLayers: [] });
        store({ ...WMS, tileSize: 512, defaultTime: '2026-01-01', wmsLayers: [{ name: 'a' }, { title: 'no name' }, null] });
        expect(getCustomBasemapConfig()).toMatchObject({ tileSize: 512, defaultTime: '2026-01-01', wmsLayers: [{ name: 'a' }] });
    });

    it('does not change what is stored', () => {
        store({ ...XYZ, attribution: 'mine' });
        getCustomBasemapConfig();
        expect(getPref(PREF.CUSTOM_BASEMAP, null).attribution).toBe('mine');
    });

    it('saveCustomBasemapConfig round-trips', () => {
        saveCustomBasemapConfig(WMS);
        expect(getCustomBasemapConfig()).toMatchObject(WMS);
    });

    it('keeps the built-in basemaps', () => {
        expect(Object.keys(Basemaps)).toContain('satellite');
    });
});

describe('isAbsoluteHttpUrl', () => {
    it.each([
        'https://tiles.example.com/{z}/{x}/{y}.png',
        'http://tiles.example.com/{z}/{x}/{y}.png',
        'https://{s}.tile.example.com/{z}/{x}/{y}.png',
        'https://{a-c}.tile.example.com/{z}/{x}/{y}.png',
        'https://maps.example.org/wms?service=WMS&version=1.3.0'
    ])('accepts %s', url => expect(isAbsoluteHttpUrl(url)).toBe(true));

    it.each([
        '//tiles.example.com/{z}/{x}/{y}.png',
        'tiles.example.com/{z}',
        'ftp://tiles.example.com/{z}/{x}/{y}.png',
        'javascript:alert(1)',
        '/relative/{z}',
        '',
        undefined,
        null
    ])('rejects %s', url => expect(isAbsoluteHttpUrl(url)).toBe(false));
});
