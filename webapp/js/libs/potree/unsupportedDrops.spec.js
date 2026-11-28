import { describe, it, expect, vi, afterEach } from 'vitest';
import { refuseUnsupportedDrops, unsupportedDropsOf } from './unsupportedDrops';

const dropOf = (...names) => {
    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { files: names.map(name => ({ name })) } });
    return event;
};

let session;
const cleanups = [];
function guard(refuse) {
    session = { track: (target, type, handler, options) => { target.addEventListener(type, handler, options); cleanups.push(() => target.removeEventListener(type, handler, options)); } };
    refuseUnsupportedDrops(session, refuse);
}
afterEach(() => { cleanups.splice(0).forEach(fn => fn()); });

describe('files dropped on the point cloud viewer', () => {
    it('names the GeoPackages among the dropped files, whatever the case', () => {
        expect(unsupportedDropsOf(dropOf('a.gpkg', 'b.JSON5', 'C.GPKG'))).toEqual(['a.gpkg', 'C.GPKG']);
        expect(unsupportedDropsOf(new Event('drop'))).toEqual([]);
    });

    it('a GeoPackage is refused before Potree\'s handler on the body sees it, which would request libraries the Hub does not have', () => {
        const refuse = vi.fn();
        const potree = vi.fn();
        document.body.addEventListener('drop', potree);
        cleanups.push(() => document.body.removeEventListener('drop', potree));
        guard(refuse);

        const event = dropOf('layer.gpkg');
        document.body.dispatchEvent(event);

        expect(refuse).toHaveBeenCalledWith(['layer.gpkg']);
        expect(potree).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(true);
    });

    it('any other drop goes to Potree as before', () => {
        const refuse = vi.fn();
        const potree = vi.fn();
        document.body.addEventListener('drop', potree);
        cleanups.push(() => document.body.removeEventListener('drop', potree));
        guard(refuse);

        document.body.dispatchEvent(dropOf('project.json5'));

        expect(refuse).not.toHaveBeenCalled();
        expect(potree).toHaveBeenCalledTimes(1);
    });
});
