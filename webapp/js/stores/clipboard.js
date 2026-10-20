// @ts-check
/**
 * Hub Copy/Cut/Paste clipboard (HQ-04; was the module-level composables/useClipboard.js).
 *
 * Holds the selection captured by Ctrl+C / Ctrl+X / the context menu, and persists it in
 * sessionStorage so it survives a refresh but not closing the tab (like a file manager).
 * Clipboard state only: pasting lives in usePasteStrategy + useFileOperations.
 */
import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import emitter from '@/libs/eventBus';
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
    const isCopy = computed(() => mode.value === 'copy');
    const count = computed(() => items.value.length);

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

    /** @param {string} path */
    const contains = path => items.value.some(it => it.path === path);

    /** Drop deleted entries; an emptied clipboard resets so the panel disappears. @param {string[]} paths */
    function removePaths(paths) {
        if (!paths || paths.length === 0 || items.value.length === 0) return;
        const deleted = new Set(paths);
        items.value = items.value.filter(it => !deleted.has(it.path));
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
    // cover replacement, rescan, ...).
    // lifetime: app (the store lives as long as the page)
    emitter.on('deleteEntries', removePaths);

    return { mode, source, items, capturedAt, isEmpty, isCut, isCopy, count, clear, copy, cut, contains, removePaths };
});
