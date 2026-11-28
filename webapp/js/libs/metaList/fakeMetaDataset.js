import { vi } from 'vitest';

/**
 * A dataset whose meta list behaves like the server's: ids, mtime in seconds, data as JSON text
 * (or as stored when it is a string), 404 when the key is empty. `calls` records the order of
 * reads, adds and removes.
 */
export function fakeMetaDataset(items = []) {
    let seq = 100;
    const ds = {
        items: items.map(i => ({ ...i })),
        calls: [],
        metaGet: vi.fn(async (key, path, options) => {
            ds.calls.push(['get', key, options && options.cache]);
            if (!ds.items.length) throw Object.assign(new Error('No metadata found'), { status: 404 });
            return ds.items.map(i => ({ ...i, data: typeof i.data === 'string' ? i.data : JSON.stringify(i.data) }));
        }),
        metaAdd: vi.fn(async (key, data) => {
            ds.calls.push(['add', data.uid]);
            const item = { id: `m${++seq}`, mtime: 2000, data };
            ds.items.push(item);
            return item;
        }),
        metaRemove: vi.fn(async id => {
            ds.calls.push(['remove', id]);
            ds.items = ds.items.filter(i => i.id !== id);
            return { count: 1 };
        })
    };
    return ds;
}
