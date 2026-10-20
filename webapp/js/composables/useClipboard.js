/**
 * Clipboard module - global reactive singleton for Hub Copy/Cut/Paste.
 *
 * Stores selection captured via Ctrl+C / Ctrl+X / context menu, exposes
 * helpers for paste flow, and persists across page reloads in
 * sessionStorage (key `ddb:hub:clipboard`). Survives refresh, NOT tab close
 * - same UX as Windows Explorer.
 *
 * Single Responsibility: clipboard state only. Paste execution lives in
 * usePasteStrategy + useFileOperations.
 */
import { reactive, computed, watch } from 'vue';
import emitter from '@/libs/eventBus';
import { getPref, setPref, PREF } from '@/libs/preferences';

const SESSION = { session: true };

const state = reactive({
    mode: null,            // 'copy' | 'cut' | null
    source: null,          // { orgSlug, dsSlug, basePath }
    items: [],             // [{ path, type, size?, entry? }] - `entry` is the full source entry (deep-copy) used to repopulate the destination after paste without an extra server round-trip.
    capturedAt: null       // ISO string
});

// Restore from sessionStorage (best-effort; a corrupt value starts empty)
const saved = getPref(PREF.CLIPBOARD, null, SESSION);
if (saved && (saved.mode === 'copy' || saved.mode === 'cut') && Array.isArray(saved.items) && saved.items.length > 0) {
    state.mode = saved.mode;
    state.source = saved.source || null;
    state.items = saved.items;
    state.capturedAt = saved.capturedAt || null;
}

// Persist on every mutation
watch(
    () => ({ mode: state.mode, source: state.source, items: state.items, capturedAt: state.capturedAt }),
    (val) => {
        const empty = !val.mode || !val.items || val.items.length === 0;
        setPref(PREF.CLIPBOARD, empty ? null : val, SESSION);
    },
    { deep: true }
);

function normalizeItems(items) {
    return items
        .filter(f => f && f.entry && f.entry.path)
        .map(f => {
            // Deep-copy the full source entry so we can reuse it (hash,
            // properties, geometries, meta, ...) when materializing the
            // destination entries after a paste. The hash in DroneDB is
            // content-based (SHA256), so it remains valid for the copied/moved
            // file at the new path.
            let entryCopy;
            try {
                entryCopy = JSON.parse(JSON.stringify(f.entry));
            } catch {
                entryCopy = null;
            }
            return {
                path: f.entry.path,
                type: f.entry.type,
                size: f.entry.size || 0,
                entry: entryCopy
            };
        });
}

function setClipboard(mode, source, items) {
    if (!items || items.length === 0) return;
    state.mode = mode;
    state.source = source || null;
    state.items = normalizeItems(items);
    state.capturedAt = new Date().toISOString();
}

const clipboard = {
    state,

    // Computed flags
    isEmpty: computed(() => !state.mode || state.items.length === 0),
    isCut: computed(() => state.mode === 'cut'),
    isCopy: computed(() => state.mode === 'copy'),
    count: computed(() => state.items.length),

    contains(path) {
        return state.items.some(it => it.path === path);
    },

    copy(source, items) {
        setClipboard('copy', source, items);
    },

    cut(source, items) {
        setClipboard('cut', source, items);
    },

    clear() {
        state.mode = null;
        state.source = null;
        state.items = [];
        state.capturedAt = null;
    }
};

// Auto-remove deleted entries from clipboard so the panel stays consistent.
// deleteEntries is emitted with an array of path strings after any deletion
// (batch delete, transfer, cover replacement, rescan, etc.).
// lifetime: app (the clipboard store is module-level)
emitter.on('deleteEntries', (deletedPaths) => {
    if (!deletedPaths || deletedPaths.length === 0 || state.items.length === 0) return;
    const deletedSet = new Set(deletedPaths);
    const before = state.items.length;
    state.items = state.items.filter(it => !deletedSet.has(it.path));
    // If the clipboard is now empty, reset it entirely so the panel disappears.
    if (state.items.length === 0 && before > 0) {
        state.mode = null;
        state.source = null;
        state.capturedAt = null;
    }
});

export default clipboard;
export { clipboard };
