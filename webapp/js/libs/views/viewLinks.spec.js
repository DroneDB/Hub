import { describe, it, expect, vi, afterEach } from 'vitest';
import { b64encode, b64decode, b64urlEncode } from '@/libs/base64';
import { createAppRouter } from '@/router';
import ddb from 'ddb';
import { fileViewUrl, savedViewUrl, viewerUrl, absoluteUrl, openInNewTab, openInNewTabIfAllowed, notGeneratedAlternative, reportUrl, itemAnchor, itemOfAnchor, VIEWER_ONLY_HELP } from './viewLinks';

const ds = { org: 'acme', ds: 'site' };
const filePath = `/r/acme/site/view/${encodeURIComponent(b64encode('flights/ortho.tif'))}/map`;

afterEach(() => vi.restoreAllMocks());

describe('fileViewUrl', () => {
    it('is the file route, with the path as standard base64', () => {
        expect(fileViewUrl(ds, 'flights/ortho.tif')).toBe(filePath);
        const nasty = 'ûÿ?>/ortho.tif';
        expect(fileViewUrl(ds, nasty)).toBe(`/r/acme/site/view/${encodeURIComponent(b64encode(nasty))}/map`);
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
            .toBe(`https://hub.example.com/r/a%20b/my%2Fds/view/${encodeURIComponent(b64encode('x.tif'))}/map`);
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

// The names whose base64 holds a "/" (and "+", "="): the address must still be the route of the viewer
describe('the address of a file whose base64 holds a slash', () => {
    const NAMES = ['长城.tif', 'foto_ñandú.tif', 'rilievo/àrea.tif', 'Привет мир.laz', '>>>???.tif'];
    const router = createAppRouter();

    it('has the premise of the review: the base64 of these names holds "/" or "+"', () => {
        expect(NAMES.filter(n => /[/+]/.test(b64encode(n)))).toEqual(expect.arrayContaining(['长城.tif', 'foto_ñandú.tif', 'rilievo/àrea.tif']));
    });

    it.each(NAMES)('%s: the map and the other viewers resolve to their route and give the path back', name => {
        for (const url of [fileViewUrl(ds, name), viewerUrl({ baseUrl: '', org: 'acme', ds: 'site', path: name, view: 'pointcloud' })]) {
            const route = router.resolve(url);
            expect(route.name).not.toBe('NotFound');
            expect(['MapViewer', 'PointCloud']).toContain(route.name);
            expect(b64decode(String(route.params.encodedPath))).toBe(name);
        }
    });

    it('keeps the query after the encoded segment', () => {
        const route = router.resolve(fileViewUrl(ds, '长城.tif', { item: 'x', viewerOnly: true }));
        expect(route.name).toBe('MapViewer');
        expect(route.query).toEqual({ item: 'x', embed: '1' });
    });

    it('still opens an address with the bare base64 of an earlier link', () => {
        const route = router.resolve(`/r/acme/site/view/${b64encode('a.tif')}/map`);
        expect(route.name).toBe('MapViewer');
    });
});

describe('viewerUrl', () => {
    const base = { baseUrl: 'https://hub.example.com', org: 'acme', ds: 'site', path: 'flights/ortho.tif', view: 'model' };
    const prefix = `https://hub.example.com/r/acme/site/view/${encodeURIComponent(b64encode('flights/ortho.tif'))}/model`;

    it('is the plain viewer address, in the viewer of the route', () => {
        expect(viewerUrl(base)).toBe(prefix);
    });

    it('adds embed=1 exactly once for a viewer-only link', () => {
        const url = viewerUrl({ ...base, viewerOnly: true });
        expect(url).toBe(`${prefix}?embed=1`);
        expect(url.match(/embed=1/g)).toHaveLength(1);
    });
});

describe('notGeneratedAlternative', () => {
    const dataset = { org: 'o', ds: 'd' };
    const model = { path: 'parts/house.obj', type: ddb.entry.type.MODEL };

    it('offers the model viewer of a model, as Viewer only when asked', () => {
        const to = `/r/o/d/view/${encodeURIComponent(b64encode(model.path))}/model`;
        expect(notGeneratedAlternative(dataset, model)).toEqual({ label: 'Open in the model viewer', icon: 'fa-solid fa-cube', view: 'model', to });
        expect(notGeneratedAlternative(dataset, model, { viewerOnly: true }).to).toBe(`${to}?embed=1`);
    });

    it('offers nothing for another file, or without a dataset or an entry', () => {
        expect(notGeneratedAlternative(dataset, { path: 'cloud.laz', type: ddb.entry.type.POINTCLOUD })).toBeNull();
        expect(notGeneratedAlternative(null, model)).toBeNull();
        expect(notGeneratedAlternative(dataset, null)).toBeNull();
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

describe('openInNewTabIfAllowed', () => {
    afterEach(() => vi.restoreAllMocks());

    it('opens a new tab, takes its opener away and says it did', () => {
        const tab = { opener: window };
        const open = vi.spyOn(window, 'open').mockImplementation(() => /** @type {any} */ (tab));
        expect(openInNewTabIfAllowed('/orgs/acme/ds/site/download/reports/a.pdf?inline=1')).toBe(true);
        // Without 'noopener', which would make window.open answer null even when the tab opened
        expect(open).toHaveBeenCalledWith('/orgs/acme/ds/site/download/reports/a.pdf?inline=1', '_blank');
        expect(tab.opener).toBeNull();
    });

    it('says it did not when the browser blocked the tab', () => {
        vi.spyOn(window, 'open').mockImplementation(() => null);
        expect(openInNewTabIfAllowed('/x')).toBe(false);
    });
});

describe('VIEWER_ONLY_HELP', () => {
    it('says what the option hides and that the dataset stays open', () => {
        expect(VIEWER_ONLY_HELP).toBe('Hides the Hub header, the back button and the buttons that add or remove layers. Anyone with the link can still open the rest of the dataset.');
    });
});

describe('the item of a viewer link', () => {
    it('is item=<id> on a file route, after the add and pick values and before embed=1', () => {
        const url = fileViewUrl(ds, 'flights/ortho.tif', { add: ['x.tif'], pick: true, item: 'a1b2', viewerOnly: true });
        expect(url).toBe(`${filePath}?add=${b64urlEncode('x.tif')}&pick=1&item=a1b2&embed=1`);
        expect(fileViewUrl(ds, 'flights/ortho.tif', { item: 'a1b2' })).toBe(`${filePath}?item=a1b2`);
    });

    it('is item=<id> on a saved view and on another viewer, encoded', () => {
        expect(savedViewUrl(ds, 'v_aaaaaaaa', { item: 'a b&c' })).toBe('/r/acme/site/views/v_aaaaaaaa?item=a%20b%26c');
        expect(savedViewUrl(ds, 'v_aaaaaaaa', { item: 'x', viewerOnly: true })).toBe('/r/acme/site/views/v_aaaaaaaa?item=x&embed=1');
        expect(viewerUrl({ baseUrl: '', org: 'acme', ds: 'site', path: 'cloud.laz', view: 'pointcloud', item: 'x' }))
            .toBe(`/r/acme/site/view/${encodeURIComponent(b64encode('cloud.laz'))}/pointcloud?item=x`);
    });

    it('is left out when there is none', () => {
        expect(fileViewUrl(ds, 'flights/ortho.tif', { item: '' })).toBe(filePath);
        expect(savedViewUrl(ds, 'v_aaaaaaaa')).toBe('/r/acme/site/views/v_aaaaaaaa');
    });
});

describe('reportUrl', () => {
    it('is the live page route of the report, encoded, absolute with a base URL', () => {
        expect(reportUrl(ds, 'r_k3x9q2m7')).toBe('/r/acme/site/reports/r_k3x9q2m7');
        expect(reportUrl({ org: 'a b', ds: 'my/ds' }, 'r_k3x9q2m7', { baseUrl: 'https://hub.example.com' })).toBe('https://hub.example.com/r/a%20b/my%2Fds/reports/r_k3x9q2m7');
    });
});

describe('the anchor of an item', () => {
    it('is #item-<id>, and the id comes back from the hash of an address', () => {
        expect(itemAnchor('a1b2')).toBe('#item-a1b2');
        expect(itemOfAnchor('#item-a1b2')).toBe('a1b2');
        expect(itemOfAnchor('#item-a1b2-2')).toBe('a1b2-2');
        expect(itemOfAnchor(itemAnchor('x y'))).toBe('x y');
    });

    it('is none for any other hash', () => {
        expect(itemOfAnchor('')).toBeNull();
        expect(itemOfAnchor('#summary')).toBeNull();
        expect(itemOfAnchor('#item-')).toBeNull();
        expect(itemOfAnchor(undefined)).toBeNull();
    });
});
