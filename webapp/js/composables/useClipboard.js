/**
 * Clipboard module — global reactive singleton for Hub Copy/Cut/Paste.
 *
 * Stores selection captured via Ctrl+C / Ctrl+X / context menu, exposes
 * helpers for paste flow, and persists across page reloads in
 * sessionStorage (key `ddb:hub:clipboard`). Survives refresh, NOT tab close
 * — same UX as Windows Explorer.
 *
 * Single Responsibility: clipboard state only. Paste execution lives in
 * usePasteStrategy + useFileOperations.
 */
import { reactive, computed, watch } from 'vue';
import emitter from '@/libs/eventBus';

const STORAGE_KEY = 'ddb:hub:clipboard';

const state = reactive({
    mode: null,            // 'copy' | 'cut' | null
    source: null,          // { orgSlug, dsSlug, basePath }
    items: [],             // [{ path, type, size? }]
    capturedAt: null       // ISO string
});

// Restore from sessionStorage (best-effort)
try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && (parsed.mode === 'copy' || parsed.mode === 'cut') && Array.isArray(parsed.items) && parsed.items.length > 0) {
            state.mode = parsed.mode;
            state.source = parsed.source || null;
            state.items = parsed.items;
            state.capturedAt = parsed.capturedAt || null;
        }
    }
} catch (e) {
    // ignore — corrupt clipboard, start fresh
}

// Persist on every mutation
watch(
    () => ({ mode: state.mode, source: state.source, items: state.items, capturedAt: state.capturedAt }),
    (val) => {
        try {
            if (!val.mode || !val.items || val.items.length === 0) {
                window.sessionStorage.removeItem(STORAGE_KEY);
            } else {
                window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(val));
            }
        } catch (e) {
            // sessionStorage unavailable / quota — non-fatal
        }
    },
    { deep: true }
);

function normalizeItems(items) {
    return items
        .filter(f => f && f.entry && f.entry.path)
        .map(f => ({
            path: f.entry.path,
            type: f.entry.type,
            size: f.entry.size || 0
        }));
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
