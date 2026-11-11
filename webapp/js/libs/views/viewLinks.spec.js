import { describe, it, expect, vi, afterEach } from 'vitest';
import { b64encode, b64urlEncode } from '@/libs/base64';
import { fileViewUrl, savedViewUrl, viewerUrl, absoluteUrl, openInNewTab, VIEWER_ONLY_HELP } from './viewLinks';

const ds = { org: 'acme', ds: 'site' };
const filePath = `/r/acme/site/view/${b64encode('flights/ortho.tif')}/map`;

afterEach(() => vi.restoreAllMocks());

describe('fileViewUrl', () => {
    it('is the file route, with the path as standard base64', () => {
        expect(fileViewUrl(ds, 'flights/ortho.tif')).toBe(filePath);
        const nasty = 'ûÿ?>/ortho.tif';
        expect(fileViewUrl(ds, nasty)).toBe(`/r/acme/site/view/${b64encode(nasty)}/map`);
    });

    it('repeats add in order, base64url encoded, so a value sits in a query as it is', () => {
        const url = fileViewUrl(ds, 'flights/ortho.tif', { add: ['b/dsm.tif', 'a/dtm.tif', 'ü é.tif'] });
        expect(url).toBe(`${filePath}?add=${b64urlEncode('b/dsm.tif')}&add=${b64urlEncode('a/dtm.tif')}&add=${b64urlEncode('ü é.tif')}`);
        expect(url.split('?')[1].replace(/add=/g, '')).not.toMatch(/[+/=]/);
    });

    it('asks for the picker with pick=1', () => {
        expect(fileViewUrl(ds, 'flights/ortho.tif', { pick: true })).toBe(`${filePath}?pick=1`);
        expect(fileViewUrl(ds, 'flights/ortho.tif', { pick: false })).toBe(filePath);
    });

    it('puts embed=1 last, once', () => {
        const url = fileViewUrl(ds, 'flights/ortho.tif', { add: ['x.tif'], pick: true, viewerOnly: true });
        expect(url).toBe(`${filePath}?add=${b64urlEncode('x.tif')}&pick=1&embed=1`);
        expect(url.match(/embed=1/g)).toHaveLength(1);
        expect(fileViewUrl(ds, 'flights/ortho.tif', { viewerOnly: true })).toBe(`${filePath}?embed=1`);
    });

    it('is absolute with a base URL, and encodes the organization and the dataset', () => {
        expect(fileViewUrl({ org: 'a b', ds: 'my/ds' }, 'x.tif', { baseUrl: 'https://hub.example.com' }))
            .toBe(`https://hub.example.com/r/a%20b/my%2Fds/view/${b64encode('x.tif')}/map`);
    });
});

describe('savedViewUrl', () => {
    it('is the saved-view route', () => {
        expect(savedViewUrl(ds, 'v_k3j9x2ab')).toBe('/r/acme/site/views/v_k3j9x2ab');
    });

    it('adds embed=1 for Viewer only, and the base URL', () => {
        expect(savedViewUrl(ds, 'v_1', { viewerOnly: true, baseUrl: 'https://hub.example.com' }))
            .toBe('https://hub.example.com/r/acme/site/views/v_1?embed=1');
    });

    it('encodes the organization, the dataset and the uid', () => {
        expect(savedViewUrl({ org: 'a b', ds: 'd&s' }, 'v 1')).toBe('/r/a%20b/d%26s/views/v%201');
    });
});

describe('viewerUrl', () => {
    const base = { baseUrl: 'https://hub.example.com', org: 'acme', ds: 'site', path: 'flights/ortho.tif', view: 'model' };
    const prefix = `https://hub.example.com/r/acme/site/view/${b64encode('flights/ortho.tif')}/model`;

    it('is the plain viewer address, in the viewer of the route', () => {
        expect(viewerUrl(base)).toBe(prefix);
    });

    it('adds embed=1 exactly once for a viewer-only link', () => {
        const url = viewerUrl({ ...base, viewerOnly: true });
        expect(url).toBe(`${prefix}?embed=1`);
        expect(url.match(/embed=1/g)).toHaveLength(1);
    });
});

describe('absoluteUrl', () => {
    it('puts the origin of the page before a path', () => {
        expect(absoluteUrl('/r/acme/site/views/v_1')).toBe(`${window.location.origin}/r/acme/site/views/v_1`);
        expect(absoluteUrl('https://other.example/x')).toBe('https://other.example/x');
    });
});

describe('openInNewTab', () => {
    it('opens a new tab that cannot reach the opener', () => {
        const open = vi.spyOn(window, 'open').mockImplementation(() => null);
        openInNewTab('/r/acme/site/views/v_1');
        expect(open).toHaveBeenCalledWith('/r/acme/site/views/v_1', '_blank', 'noopener');
    });
});

describe('VIEWER_ONLY_HELP', () => {
    it('says what the option hides and that the dataset stays open', () => {
        expect(VIEWER_ONLY_HELP).toBe('Hides the Hub header, the back button and the buttons that add or remove layers. Anyone with the link can still open the rest of the dataset.');
    });
});
