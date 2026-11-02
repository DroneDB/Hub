import { describe, it, expect } from 'vitest';
import { b64encode, b64urlEncode } from './base64';
import { viewerUrl, VIEWER_ONLY_HELP } from './viewerLinks';

const base = { baseUrl: 'https://hub.example.com', org: 'acme', ds: 'site', path: 'flights/ortho.tif', view: 'map' };
const prefix = `https://hub.example.com/r/acme/site/view/${b64encode('flights/ortho.tif')}/map`;

describe('viewerUrl', () => {
    it('is the plain viewer address without layers or viewer-only', () => {
        expect(viewerUrl(base)).toBe(prefix);
    });

    it('adds embed=1 exactly once for a viewer-only link', () => {
        const url = viewerUrl({ ...base, viewerOnly: true });
        expect(url).toBe(`${prefix}?embed=1`);
        expect(url.match(/embed=1/g)).toHaveLength(1);
    });

    it('repeats layer in the given order, base64url encoded', () => {
        const url = viewerUrl({ ...base, layers: ['b/dsm.tif', 'a/dtm.tif', 'ü é.tif'] });
        expect(url).toBe(`${prefix}?layer=${b64urlEncode('b/dsm.tif')}&layer=${b64urlEncode('a/dtm.tif')}&layer=${b64urlEncode('ü é.tif')}`);
        expect(url.split('?')[1].replace(/layer=/g, '')).not.toMatch(/[+/=]/);
    });

    it('puts embed=1 once after the layers', () => {
        const url = viewerUrl({ ...base, layers: ['dsm.tif', 'dtm.tif'], viewerOnly: true });
        expect(url).toBe(`${prefix}?layer=${b64urlEncode('dsm.tif')}&layer=${b64urlEncode('dtm.tif')}&embed=1`);
        expect(url.match(/embed=1/g)).toHaveLength(1);
    });

    it('is the same address as the share dialog built before, for any path', () => {
        const path = 'ûÿ?>/ortho.tif';
        expect(viewerUrl({ ...base, path })).toBe(`https://hub.example.com/r/acme/site/view/${b64encode(path)}/map`);
    });
});

describe('VIEWER_ONLY_HELP', () => {
    it('says what the option hides and that the dataset stays open', () => {
        expect(VIEWER_ONLY_HELP).toBe('Hides the Hub header, the back button and the buttons that add or remove layers. Anyone with the link can still open the rest of the dataset.');
    });
});
