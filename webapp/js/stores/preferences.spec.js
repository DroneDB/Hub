import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const h = vi.hoisted(() => ({ reg: null, auth: null, notify: null }));
vi.mock('@/libs/api/sharedRegistry', () => {
    h.reg = { getRequest: vi.fn(), patchRequest: vi.fn() };
    return { default: h.reg };
});
vi.mock('@/stores/auth', async () => {
    const { reactive } = await import('vue');
    h.auth = reactive({ username: 'ann', isLoggedIn: true });
    return { useAuthStore: () => h.auth };
});
vi.mock('@/composables/useNotify', () => {
    h.notify = { warn: vi.fn(), error: vi.fn(), success: vi.fn(), info: vi.fn() };
    return { useNotify: () => h.notify };
});

const { usePreferencesStore } = await import('./preferences');
const {
    PREF, setPref, getPref, applyAccountValue, _resetPrefListenersForTests
} = await import('@/libs/preferences');

const ENDPOINT = '/users/preferences';
const OPTS = { invalidate: ENDPOINT };
let store;

/** A promise settled from the test, to hold a request in flight. */
function deferred() {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}
const conflict = () => Object.assign(new Error('conflict'), { status: 409 });
const failure = () => Object.assign(new Error('server error'), { status: 500 });
const tick = (ms = 0) => vi.advanceTimersByTimeAsync(ms);
const bodies = () => h.reg.patchRequest.mock.calls.map(c => c[1]);

/** A synced account whose sections match nothing local: loading it sends nothing. */
const SYNCED_ACCOUNT = { units: { measurement: 'metric' }, map: { showFlightPath: true } };

/** Creates the store (the user is logged in) and lets the load settle. */
async function start(account = SYNCED_ACCOUNT) {
    h.reg.getRequest.mockResolvedValue(account);
    setActivePinia(createPinia());
    store = usePreferencesStore();
    await tick();
    return store;
}

beforeEach(() => {
    vi.useFakeTimers();
    _resetPrefListenersForTests();
    localStorage.clear();
    sessionStorage.clear();
    h.auth.isLoggedIn = true;
    h.auth.username = 'ann';
    h.reg.getRequest.mockReset();
    h.reg.patchRequest.mockReset();
    h.reg.patchRequest.mockResolvedValue({});
    Object.values(h.notify).forEach(f => f.mockReset());
    vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
    store?.$dispose();
    store = null;
    _resetPrefListenersForTests();
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('preferences store: load', () => {
    it('reads the account without the request cache', async () => {
        await start();
        expect(h.reg.getRequest).toHaveBeenCalledTimes(1);
        expect(h.reg.getRequest).toHaveBeenCalledWith(ENDPOINT, { cache: false });
    });

    it('an empty account is seeded with one PATCH of the local values', async () => {
        setPref(PREF.MEASURE_UNIT, 'imperial');
        setPref(PREF.SHOW_FLIGHT_PATH, false);
        await start({});
        expect(h.reg.patchRequest).toHaveBeenCalledTimes(1);
        const [endpoint, body, options] = h.reg.patchRequest.mock.calls[0];
        expect(endpoint).toBe(ENDPOINT);
        expect(options).toEqual(OPTS);
        // A section is whole: unset fields are explicit nulls
        expect(body).toEqual({
            units: { measurement: 'imperial' },
            map: { basemap: null, customBasemap: null, showDirectionIndicators: null, showFlightPath: false }
        });
        expect(store.status).toBe('idle');
    });

    it('an empty account and nothing set locally sends no PATCH', async () => {
        await start({});
        await tick(5000);
        expect(h.reg.patchRequest).not.toHaveBeenCalled();
        expect(store.status).toBe('idle');
    });

    it('a null account body counts as empty', async () => {
        setPref(PREF.MEASURE_UNIT, 'imperial');
        await start(null);
        expect(bodies()).toEqual([{ units: { measurement: 'imperial' } }]);
    });

    it('a non-empty account overwrites the local values and sends no PATCH', async () => {
        setPref(PREF.MEASURE_UNIT, 'metric');
        setPref(PREF.SHOW_FLIGHT_PATH, true);
        await start({ units: { measurement: 'imperial' }, map: { showFlightPath: false } });
        expect(getPref(PREF.MEASURE_UNIT, '')).toBe('imperial');
        expect(getPref(PREF.SHOW_FLIGHT_PATH, true)).toBe(false);
        await tick(5000);
        expect(h.reg.patchRequest).not.toHaveBeenCalled();
    });

    it('applies object values of the account as they are', async () => {
        await start({ orgs: { list: { itemsPerPage: 50, ownedOnly: false } }, units: { measurement: 'imperial' } });
        expect(getPref(PREF.ORG_PAGE, null)).toEqual({ itemsPerPage: 50, ownedOnly: false });
        expect(h.reg.patchRequest).not.toHaveBeenCalled();
    });

    it('a null field of the account removes the local value', async () => {
        setPref(PREF.MEASURE_UNIT, 'imperial');
        await start({ units: { measurement: null }, map: { showFlightPath: true } });
        expect(localStorage.getItem(PREF.MEASURE_UNIT)).toBeNull();
        expect(h.reg.patchRequest).not.toHaveBeenCalled();
    });

    it('a field the account lacks but is set locally is sent, the account fields are not', async () => {
        setPref(PREF.SHOW_DIRECTION_INDICATORS, true);
        await start({ units: { measurement: 'imperial' }, map: { showFlightPath: true } });
        expect(bodies()).toEqual([{
            map: { basemap: null, customBasemap: null, showDirectionIndicators: true, showFlightPath: true }
        }]);
    });

    it('a section the account lacks is sent when set locally', async () => {
        setPref(PREF.FILE_VIEW_MODE, 'table');
        await start({ units: { measurement: 'imperial' } });
        expect(bodies()).toEqual([{ explorer: { viewMode: 'table', tableExpandedGrid: null, sortDescending: null } }]);
    });

    describe('build notifications (the server e-mails by them)', () => {
        it('are synced as notifications.builds', async () => {
            await start();
            setPref(PREF.BUILD_NOTIFICATIONS, 'failed');
            await tick(600);
            expect(bodies()).toEqual([{ notifications: { builds: 'failed' } }]);
        });

        it('take the account value over the device one', async () => {
            setPref(PREF.BUILD_NOTIFICATIONS, 'all');
            await start({ ...SYNCED_ACCOUNT, notifications: { builds: 'failed' } });
            expect(getPref(PREF.BUILD_NOTIFICATIONS, '')).toBe('failed');
            expect(h.reg.patchRequest).not.toHaveBeenCalled();
        });

        it('a value left on the device is dropped, never sent, for an account without one', async () => {
            // Another user of this device, or a reset made on another device
            setPref(PREF.BUILD_NOTIFICATIONS, 'all');
            await start(SYNCED_ACCOUNT);
            await tick(5000);
            expect(localStorage.getItem(PREF.BUILD_NOTIFICATIONS)).toBeNull();
            expect(h.reg.patchRequest).not.toHaveBeenCalled();
        });

        it('a change made during the load is still sent', async () => {
            const read = deferred();
            h.reg.getRequest.mockReturnValue(read.promise);
            setActivePinia(createPinia());
            store = usePreferencesStore();
            setPref(PREF.BUILD_NOTIFICATIONS, 'all');
            read.resolve(SYNCED_ACCOUNT);
            await tick(600);
            expect(getPref(PREF.BUILD_NOTIFICATIONS, '')).toBe('all');
            expect(bodies()).toEqual([{ notifications: { builds: 'all' } }]);
        });
    });

    it('does not echo what it applied (account origin is not sent)', async () => {
        await start({ units: { measurement: 'imperial' } });
        await tick(5000);
        expect(h.reg.patchRequest).not.toHaveBeenCalled();
    });

    it('a failed load sets the error status, warns once and keeps local values', async () => {
        setPref(PREF.MEASURE_UNIT, 'imperial');
        h.reg.getRequest.mockRejectedValue(failure());
        setActivePinia(createPinia());
        store = usePreferencesStore();
        await tick();
        expect(store.status).toBe('error');
        expect(h.notify.warn).toHaveBeenCalledTimes(1);
        expect(getPref(PREF.MEASURE_UNIT, '')).toBe('imperial');
        expect(h.reg.patchRequest).not.toHaveBeenCalled();
    });

    it('does nothing while logged out and starts on login', async () => {
        h.auth.isLoggedIn = false;
        await start();
        expect(h.reg.getRequest).not.toHaveBeenCalled();
        await store.load();
        expect(h.reg.getRequest).not.toHaveBeenCalled();
        h.auth.isLoggedIn = true;
        await tick();
        expect(h.reg.getRequest).toHaveBeenCalledTimes(1);
    });

    it('exposes the section names', async () => {
        await start();
        expect(store.sections).toEqual(['units', 'map', 'explorer', 'datasets', 'orgs', 'viewers', 'notifications']);
    });
});

describe('preferences store: sending changes', () => {
    it('two changes within 600 ms are one PATCH with both sections', async () => {
        await start();
        setPref(PREF.MEASURE_UNIT, 'imperial');
        await tick(300);
        setPref(PREF.FILE_VIEW_MODE, 'table');
        // the second change restarted the delay: 600 ms after the first is too early
        await tick(300);
        expect(h.reg.patchRequest).not.toHaveBeenCalled();
        await tick(299);
        expect(h.reg.patchRequest).not.toHaveBeenCalled();
        await tick(1);
        expect(h.reg.patchRequest).toHaveBeenCalledTimes(1);
        expect(bodies()[0]).toEqual({
            units: { measurement: 'imperial' },
            explorer: { viewMode: 'table', tableExpandedGrid: null, sortDescending: null }
        });
        expect(h.reg.patchRequest.mock.calls[0][2]).toEqual(OPTS);
    });

    it('sends a single change after 600 ms, not before', async () => {
        await start();
        setPref(PREF.MEASURE_UNIT, 'imperial');
        expect(store.status).toBe('saving');
        await tick(599);
        expect(h.reg.patchRequest).not.toHaveBeenCalled();
        await tick(1);
        expect(h.reg.patchRequest).toHaveBeenCalledTimes(1);
        expect(store.status).toBe('idle');
    });

    it('a change during an in-flight PATCH goes after it, never in parallel', async () => {
        await start();
        let running = 0;
        let maxRunning = 0;
        const first = deferred();
        h.reg.patchRequest.mockImplementationOnce(() => { running++; maxRunning = Math.max(maxRunning, running); return first.promise.finally(() => running--); });
        h.reg.patchRequest.mockImplementation(() => { running++; maxRunning = Math.max(maxRunning, running); return Promise.resolve({}).finally(() => running--); });

        setPref(PREF.MEASURE_UNIT, 'imperial');
        await tick(600);
        expect(h.reg.patchRequest).toHaveBeenCalledTimes(1);

        setPref(PREF.FILE_VIEW_MODE, 'table');
        await tick(1000);
        expect(h.reg.patchRequest).toHaveBeenCalledTimes(1);
        expect(store.status).toBe('saving');

        first.resolve({});
        await tick();
        expect(h.reg.patchRequest).toHaveBeenCalledTimes(2);
        expect(Object.keys(bodies()[1])).toEqual(['explorer']);
        expect(maxRunning).toBe(1);
        expect(store.status).toBe('idle');
    });

    it('a change of the section in flight is sent again after it', async () => {
        await start();
        const first = deferred();
        h.reg.patchRequest.mockImplementationOnce(() => first.promise);
        setPref(PREF.MEASURE_UNIT, 'imperial');
        await tick(600);
        setPref(PREF.MEASURE_UNIT, 'metric');
        await tick(600);
        first.resolve({});
        await tick();
        expect(bodies()).toEqual([{ units: { measurement: 'imperial' } }, { units: { measurement: 'metric' } }]);
    });

    it('409 reads the account, applies the clean sections and sends the dirty ones', async () => {
        await start();
        h.reg.patchRequest.mockRejectedValueOnce(conflict());
        h.reg.getRequest.mockResolvedValue({ units: { measurement: 'metric' }, map: { showFlightPath: true }, explorer: { viewMode: 'table', tableExpandedGrid: true, sortDescending: true } });
        setPref(PREF.MEASURE_UNIT, 'imperial');
        await tick(600);
        expect(h.reg.getRequest).toHaveBeenCalledTimes(2);
        expect(h.reg.getRequest).toHaveBeenLastCalledWith(ENDPOINT, { cache: false });
        expect(h.reg.patchRequest).toHaveBeenCalledTimes(2);
        // the dirty section is not overwritten by the account, and is sent again
        expect(bodies()[1]).toEqual({ units: { measurement: 'imperial' } });
        expect(getPref(PREF.MEASURE_UNIT, '')).toBe('imperial');
        // a section that was not dirty took the account's values
        expect(getPref(PREF.FILE_VIEW_MODE, '')).toBe('table');
        expect(store.status).toBe('idle');
        expect(h.notify.warn).not.toHaveBeenCalled();
    });

    it('a second consecutive 409 is an error, with one warning and no more requests', async () => {
        await start();
        h.reg.patchRequest.mockRejectedValue(conflict());
        setPref(PREF.MEASURE_UNIT, 'imperial');
        await tick(600);
        await tick(5000);
        expect(h.reg.patchRequest).toHaveBeenCalledTimes(2);
        expect(h.reg.getRequest).toHaveBeenCalledTimes(2);
        expect(store.status).toBe('error');
        expect(h.notify.warn).toHaveBeenCalledTimes(1);
    });

    it('a 409 after a successful send of the same loop may reload again', async () => {
        await start();
        h.reg.patchRequest
            .mockRejectedValueOnce(conflict())
            .mockResolvedValueOnce({})
            .mockRejectedValueOnce(conflict())
            .mockResolvedValue({});
        setPref(PREF.MEASURE_UNIT, 'imperial');
        await tick(600);
        setPref(PREF.FILE_VIEW_MODE, 'table');
        await tick(600);
        expect(store.status).toBe('idle');
        expect(h.notify.warn).not.toHaveBeenCalled();
    });

    it('does not send changes that come from the account or from another tab', async () => {
        await start();
        applyAccountValue(PREF.MEASURE_UNIT, 'imperial');
        localStorage.setItem(PREF.FILE_VIEW_MODE, 'table');
        window.dispatchEvent(new StorageEvent('storage', { key: PREF.FILE_VIEW_MODE, storageArea: localStorage }));
        await tick(5000);
        expect(h.reg.patchRequest).not.toHaveBeenCalled();
    });

    it('does not send the keys that stay on the device', async () => {
        await start();
        setPref(PREF.PANEL_SIZES, { 'x.desktop': 40 });
        setPref(PREF.ORG_PAGE_POSITION, { currentPage: 3, scrollTop: 10 });
        setPref(PREF.CLIPBOARD, 'x', { session: true });
        setPref('unrelated-key', 1);
        await tick(5000);
        expect(h.reg.patchRequest).not.toHaveBeenCalled();
        expect(store.status).toBe('idle');
    });

    it('never sends wmsLayers of the custom basemap', async () => {
        await start();
        setPref(PREF.CUSTOM_BASEMAP, {
            sourceType: 'wms', url: 'https://tiles.example/wms', layerName: 'l', attribution: 'x',
            wmsLayers: [{ name: 'a', title: 'A' }]
        });
        await tick(600);
        const custom = bodies()[0].map.customBasemap;
        expect(custom).toEqual({ sourceType: 'wms', url: 'https://tiles.example/wms', layerName: 'l', attribution: 'x' });
        expect(JSON.stringify(bodies())).not.toContain('wmsLayers');
    });

    it('sends the organisations list as {itemsPerPage, ownedOnly} only', async () => {
        await start();
        setPref(PREF.ORG_PAGE, { itemsPerPage: 25, ownedOnly: false, currentPage: 4, scrollTop: 99 });
        await tick(600);
        expect(bodies()[0]).toEqual({ orgs: { list: { itemsPerPage: 25, ownedOnly: false } } });
    });

    it('a failed PATCH keeps the section dirty, and the next change sends it with its own, warning once', async () => {
        await start();
        h.reg.patchRequest.mockRejectedValueOnce(failure());
        setPref(PREF.MEASURE_UNIT, 'imperial');
        await tick(600);
        expect(store.status).toBe('error');
        expect(h.notify.warn).toHaveBeenCalledTimes(1);
        // no timed retry
        await tick(60000);
        expect(h.reg.patchRequest).toHaveBeenCalledTimes(1);

        h.reg.patchRequest.mockRejectedValueOnce(failure());
        setPref(PREF.FILE_VIEW_MODE, 'table');
        await tick(600);
        expect(h.reg.patchRequest).toHaveBeenCalledTimes(2);
        expect(Object.keys(bodies()[1]).sort()).toEqual(['explorer', 'units']);
        expect(h.notify.warn).toHaveBeenCalledTimes(1);

        setPref(PREF.FILE_VIEW_MODE, 'grid');
        await tick(600);
        expect(h.reg.patchRequest).toHaveBeenCalledTimes(3);
        expect(Object.keys(bodies()[2]).sort()).toEqual(['explorer', 'units']);
        expect(store.status).toBe('idle');
    });

    it('a failed PATCH is sent again by the next load', async () => {
        await start();
        h.reg.patchRequest.mockRejectedValueOnce(failure());
        setPref(PREF.MEASURE_UNIT, 'imperial');
        await tick(600);
        h.reg.getRequest.mockResolvedValue({ units: { measurement: 'metric' }, map: { showFlightPath: true } });
        await store.load();
        // the section is dirty: the account does not overwrite it, and it goes out
        expect(getPref(PREF.MEASURE_UNIT, '')).toBe('imperial');
        expect(bodies()[1]).toEqual({ units: { measurement: 'imperial' } });
    });
});

describe('preferences store: local change during load', () => {
    it('keeps the section and the value, and sends it after the load', async () => {
        const account = deferred();
        h.reg.getRequest.mockReturnValue(account.promise);
        setActivePinia(createPinia());
        store = usePreferencesStore();
        await tick();
        expect(store.status).toBe('loading');

        setPref(PREF.MEASURE_UNIT, 'imperial');
        await tick(1000); // longer than the delay: nothing is sent while loading
        expect(h.reg.patchRequest).not.toHaveBeenCalled();

        account.resolve({ units: { measurement: 'metric' }, map: { showFlightPath: false } });
        await tick();
        expect(getPref(PREF.MEASURE_UNIT, '')).toBe('imperial');
        // the other section took the account
        expect(getPref(PREF.SHOW_FLIGHT_PATH, true)).toBe(false);
        expect(bodies()).toEqual([{ units: { measurement: 'imperial' } }]);
    });
});

describe('preferences store: session end', () => {
    it('logout cancels the pending delay and sends nothing afterwards', async () => {
        await start();
        setPref(PREF.MEASURE_UNIT, 'imperial');
        await tick(300);
        h.auth.isLoggedIn = false;
        await tick(5000);
        expect(h.reg.patchRequest).not.toHaveBeenCalled();
        setPref(PREF.MEASURE_UNIT, 'metric');
        await tick(5000);
        expect(h.reg.patchRequest).not.toHaveBeenCalled();
        // local values stay
        expect(getPref(PREF.MEASURE_UNIT, '')).toBe('metric');
        expect(store.status).toBe('idle');
    });

    it('the result of a PATCH that was in flight at logout is ignored (failure: no warning)', async () => {
        await start();
        const inFlight = deferred();
        h.reg.patchRequest.mockReturnValueOnce(inFlight.promise);
        setPref(PREF.MEASURE_UNIT, 'imperial');
        await tick(600);
        h.auth.isLoggedIn = false;
        await tick();
        inFlight.reject(failure());
        await tick();
        expect(h.notify.warn).not.toHaveBeenCalled();
        expect(store.status).toBe('idle');
    });

    it('a 409 that arrives after logout does not read the account', async () => {
        await start();
        const inFlight = deferred();
        h.reg.patchRequest.mockReturnValueOnce(inFlight.promise);
        setPref(PREF.MEASURE_UNIT, 'imperial');
        await tick(600);
        h.auth.isLoggedIn = false;
        await tick();
        inFlight.reject(conflict());
        await tick();
        expect(h.reg.getRequest).toHaveBeenCalledTimes(1);
    });

    it('the account read that arrives after logout is not applied', async () => {
        const account = deferred();
        h.reg.getRequest.mockReturnValue(account.promise);
        setActivePinia(createPinia());
        store = usePreferencesStore();
        await tick();
        h.auth.isLoggedIn = false;
        await tick();
        account.resolve({ units: { measurement: 'imperial' } });
        await tick();
        expect(localStorage.getItem(PREF.MEASURE_UNIT)).toBeNull();
        expect(store.status).toBe('idle');
    });

    it('a new login starts a new session: loads again, and the old answer is dropped', async () => {
        const oldAnswer = deferred();
        h.reg.getRequest.mockReturnValueOnce(oldAnswer.promise);
        setActivePinia(createPinia());
        store = usePreferencesStore();
        await tick();
        h.reg.getRequest.mockResolvedValue({ units: { measurement: 'metric' }, map: { showFlightPath: true } });
        h.auth.username = 'bob';
        await tick();
        expect(h.reg.getRequest).toHaveBeenCalledTimes(2);
        oldAnswer.resolve({ units: { measurement: 'imperial' } });
        await tick();
        expect(getPref(PREF.MEASURE_UNIT, '')).toBe('metric');
    });

    it('logs in again after a logout, and warns again in the new session', async () => {
        await start();
        h.reg.patchRequest.mockRejectedValue(failure());
        setPref(PREF.MEASURE_UNIT, 'imperial');
        await tick(600);
        expect(h.notify.warn).toHaveBeenCalledTimes(1);
        h.auth.isLoggedIn = false;
        await tick();
        h.auth.isLoggedIn = true;
        await tick();
        // the account is read again; the dirty set of the old session is gone, nothing local is unsent
        expect(h.reg.getRequest).toHaveBeenCalledTimes(2);
    });
});

describe('preferences store: reset', () => {
    it('resetSection removes the local values and sends the section as null', async () => {
        setPref(PREF.MEASURE_UNIT, 'imperial');
        await start({ units: { measurement: 'imperial' }, map: { showFlightPath: true } });
        const events = [];
        const { onPrefChange } = await import('@/libs/preferences');
        const off = onPrefChange((k, v, o) => events.push([k, o]));
        store.resetSection('units');
        expect(localStorage.getItem(PREF.MEASURE_UNIT)).toBeNull();
        expect(events).toContainEqual([PREF.MEASURE_UNIT, 'local']); // open views follow
        off();
        await tick(600);
        expect(bodies()).toEqual([{ units: null }]);
    });

    it('resetSection goes through the queue, never a separate request in parallel', async () => {
        setPref(PREF.MEASURE_UNIT, 'imperial');
        await start({ units: { measurement: 'imperial' } });
        const first = deferred();
        h.reg.patchRequest.mockReturnValueOnce(first.promise);
        setPref(PREF.FILE_VIEW_MODE, 'table');
        await tick(600);
        store.resetSection('units');
        await tick(1000);
        expect(h.reg.patchRequest).toHaveBeenCalledTimes(1);
        first.resolve({});
        await tick();
        expect(bodies()[1]).toEqual({ units: null });
    });

    it('resetAll removes every account value and sends every section as null in one PATCH', async () => {
        setPref(PREF.MEASURE_UNIT, 'imperial');
        setPref(PREF.FILE_VIEW_MODE, 'table');
        setPref(PREF.MODEL_LIGHTING, { ambientIntensity: 1 });
        setPref(PREF.PANEL_SIZES, { a: 1 });
        await start({ units: { measurement: 'imperial' }, explorer: { viewMode: 'table' }, viewers: { modelLighting: { ambientIntensity: 1 } } });
        store.resetAll();
        expect(localStorage.getItem(PREF.MEASURE_UNIT)).toBeNull();
        expect(localStorage.getItem(PREF.FILE_VIEW_MODE)).toBeNull();
        expect(localStorage.getItem(PREF.MODEL_LIGHTING)).toBeNull();
        // a device-only key is not an account value
        expect(localStorage.getItem(PREF.PANEL_SIZES)).not.toBeNull();
        await tick(600);
        expect(h.reg.patchRequest).toHaveBeenCalledTimes(1);
        expect(bodies()[0]).toEqual({ units: null, map: null, explorer: null, datasets: null, orgs: null, viewers: null, notifications: null });
    });

    describe('the lighting of the 3D models, stored as the Nexus lighting before', () => {
        const OLD_KEY = 'nexus-lighting-settings';

        it('carries the account\'s old field over to the new one and sends the section without the old name', async () => {
            await start({ viewers: { nexusLighting: { ambientIntensity: 2 }, splatNavMode: 'fly' } });
            expect(getPref(PREF.MODEL_LIGHTING, null)).toEqual({ ambientIntensity: 2 });
            await tick(600);
            expect(bodies()).toEqual([{ viewers: { splatNavMode: 'fly', modelLighting: { ambientIntensity: 2 }, splatQuality: null, unifiedLighting: null } }]);
        });

        it('lets the new field win when the account holds both, and drops the old one', async () => {
            await start({ viewers: { nexusLighting: { ambientIntensity: 2 }, modelLighting: { ambientIntensity: 1 } } });
            expect(getPref(PREF.MODEL_LIGHTING, null)).toEqual({ ambientIntensity: 1 });
            await tick(600);
            expect(bodies()[0].viewers).toMatchObject({ modelLighting: { ambientIntensity: 1 } });
            expect(bodies()[0].viewers).not.toHaveProperty('nexusLighting');
        });

        it('takes the old field over the old key of the device, and removes that key', async () => {
            localStorage.setItem(OLD_KEY, JSON.stringify({ ambientIntensity: 3 }));
            await start({ viewers: { nexusLighting: { ambientIntensity: 2 } } });
            expect(getPref(PREF.MODEL_LIGHTING, null)).toEqual({ ambientIntensity: 2 });
            expect(localStorage.getItem(OLD_KEY)).toBeNull();
        });

        it('sends the old key of the device to an account that has neither field', async () => {
            localStorage.setItem(OLD_KEY, JSON.stringify({ ambientIntensity: 3 }));
            await start({ viewers: { splatNavMode: 'fly' } });
            await tick(600);
            expect(bodies()[0].viewers).toMatchObject({ modelLighting: { ambientIntensity: 3 } });
            expect(localStorage.getItem(OLD_KEY)).toBeNull();
        });

        it('sends nothing for an account with the new field only', async () => {
            await start({ ...SYNCED_ACCOUNT, viewers: { modelLighting: { ambientIntensity: 1 } } });
            await tick(600);
            expect(h.reg.patchRequest).not.toHaveBeenCalled();
        });
    });

    it('does not send a reset when logged out', async () => {
        h.auth.isLoggedIn = false;
        await start();
        setPref(PREF.MEASURE_UNIT, 'imperial');
        store.resetSection('units');
        await tick(5000);
        expect(h.reg.patchRequest).not.toHaveBeenCalled();
    });
});
