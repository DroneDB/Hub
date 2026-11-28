// @ts-check
/**
 * Hub Copy/Cut/Paste clipboard.
 *
 * Holds the selection captured by Ctrl+C / Ctrl+X / the context menu, and persists it in
 * sessionStorage so it survives a refresh but not closing the tab (like a file manager).
 * Clipboard state only: pasting lives in usePasteStrategy + useDatasetClipboard. It is the signed-in user's: the
 * preferences store, which follows the session, empties it (`clear`) when the session ends, so the next user of the
 * tab does not find (or paste) it.
 */
import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import emitter from '@/libs/eventBus';
import { deletedPathsOf, deletedDatasetOf } from '@/libs/dataset/deletedEntries';
import { getPref, setPref, PREF } from '@/libs/preferences';

const SESSION = { session: true };

/**
 * @typedef {{ orgSlug: string, dsSlug: string, basePath: string }} ClipboardSource
 * @typedef {{ path: string, type: number, size: number, entry: object|null }} ClipboardItem
 */

/** @param {Array<{ entry?: { path: string, type: number, size?: number } }>} files @returns {ClipboardItem[]} */
function normalizeItems(files) {
    return files
        .filter(f => f && f.entry && f.entry.path)
        .map(f => {
            // Deep-copy the full source entry so it can be reused (hash, properties,
            // geometries, meta, ...) for the destination entries after a paste. DroneDB
            // hashes are content-based, so they stay valid at the new path.
            let entry;
            try {
                entry = JSON.parse(JSON.stringify(f.entry));
            } catch {
                entry = null;
            }
            return { path: f.entry.path, type: f.entry.type, size: f.entry.size || 0, entry };
        });
}

export const useClipboardStore = defineStore('clipboard', () => {
    /** @type {import('vue').Ref<'copy'|'cut'|null>} */
    const mode = ref(null);
    /** @type {import('vue').Ref<ClipboardSource|null>} */
    const source = ref(null);
    /** @type {import('vue').Ref<ClipboardItem[]>} */
    const items = ref([]);
    /** @type {import('vue').Ref<string|null>} */
    const capturedAt = ref(null);

    const isEmpty = computed(() => !mode.value || items.value.length === 0);
    const isCut = computed(() => mode.value === 'cut');
    const count = computed(() => items.value.length);
    // The paths that a paste will move, while the clipboard holds a cut: the explorers dim them (FR-EXP-16)
    const cutPaths = computed(() => new Set(isCut.value && !isEmpty.value ? items.value.map(it => it.path) : []));

    /**
     * Whether `path` of a dataset was cut and is not pasted yet.
     * @param {string} orgSlug @param {string} dsSlug @param {string} path
     */
    function isCutAt(orgSlug, dsSlug, path) {
        const src = source.value;
        return !!src && src.orgSlug === orgSlug && src.dsSlug === dsSlug && cutPaths.value.has(path);
    }

    function clear() {
        mode.value = null;
        source.value = null;
        items.value = [];
        capturedAt.value = null;
    }

    /** @param {'copy'|'cut'} m @param {ClipboardSource|null} src @param {Array<object>} files */
    function capture(m, src, files) {
        if (!files || files.length === 0) return;
        mode.value = m;
        source.value = src || null;
        items.value = normalizeItems(files);
        capturedAt.value = new Date().toISOString();
    }

    /** @param {ClipboardSource|null} src @param {Array<object>} files */
    const copy = (src, files) => capture('copy', src, files);
    /** @param {ClipboardSource|null} src @param {Array<object>} files */
    const cut = (src, files) => capture('cut', src, files);

    /**
     * Drop entries that left their dataset: the paths themselves and what was under them (a deleted folder takes its
     * files); an emptied clipboard resets so the panel disappears. A deletion in `within` concerns the clipboard only
     * when it was copied from that dataset (the same path of another dataset is another file).
     * @param {string[]} paths
     * @param {{ orgSlug: string, dsSlug: string }|null} [within]  the dataset the paths are of; any when not given
     */
    function removePaths(paths, within = null) {
        if (!paths || paths.length === 0 || items.value.length === 0) return;
        if (within && (source.value?.orgSlug !== within.orgSlug || source.value?.dsSlug !== within.dsSlug)) return;
        const gone = (/** @type {string} */ path) => paths.some(p => path === p || path.startsWith(`${p}/`));
        items.value = items.value.filter(it => !gone(it.path));
        if (items.value.length === 0) clear();
    }

    // Restore (a corrupt or partial value starts empty)
    const saved = getPref(PREF.CLIPBOARD, null, SESSION);
    if (saved && (saved.mode === 'copy' || saved.mode === 'cut') && Array.isArray(saved.items) && saved.items.length > 0) {
        mode.value = saved.mode;
        source.value = saved.source || null;
        items.value = saved.items;
        capturedAt.value = saved.capturedAt || null;
    }

    watch([mode, source, items, capturedAt], () => {
        setPref(PREF.CLIPBOARD, isEmpty.value
            ? null
            : { mode: mode.value, source: source.value, items: items.value, capturedAt: capturedAt.value }, SESSION);
    }, { deep: true });

    // deleteEntries carries the paths removed by any deletion (batch delete, transfer,
    // cover replacement, rescan, ...) and the dataset they left: only the clipboard of that dataset loses them, whatever
    // page is on show when the deletion is told. An event that names no dataset is not the clipboard's.
    // lifetime: app (the store lives as long as the page)
    emitter.on('deleteEntries', /** @param {unknown} event */ event => {
        const dataset = deletedDatasetOf(event);
        if (dataset) removePaths(deletedPathsOf(event), { orgSlug: dataset.org, dsSlug: dataset.ds });
    });

    return { mode, source, items, capturedAt, isEmpty, isCut, count, cutPaths, isCutAt, clear, copy, cut, removePaths };
});
