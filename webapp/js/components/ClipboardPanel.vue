<template>
    <transition name="clipboard-fade">
        <div v-if="!isEmpty" class="clipboard-panel" :class="{ 'cut-mode': isCut }">
            <div class="clipboard-panel-header">
                <span class="clipboard-panel-title">
                    <i class="fa-solid fa-clipboard"></i>
                    Clipboard
                    <span class="clipboard-panel-mode">{{ isCut ? 'Cut' : 'Copy' }}</span>
                </span>
                <button class="clipboard-panel-close" @click="clear" title="Clear clipboard">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
            <div class="clipboard-panel-source">
                <i class="fa-solid fa-folder-open"></i>
                {{ source && source.orgSlug }} / {{ source && source.dsSlug }}<span v-if="source && source.basePath"> / {{ source.basePath }}</span>
            </div>
            <div class="clipboard-panel-count">
                {{ count }} item<span v-if="count !== 1">s</span>
            </div>
            <ul class="clipboard-panel-list">
                <li v-for="it in visibleItems" :key="it.path" class="clipboard-panel-item" :title="it.path">
                    <i class="fa-solid" :class="iconFor(it)"></i>
                    {{ basename(it.path) }}
                </li>
                <li v-if="hiddenCount > 0" class="clipboard-panel-more">
                    + {{ hiddenCount }} more
                </li>
            </ul>
        </div>
    </transition>
</template>

<script>
import clipboard from '@/composables/useClipboard';
import ddb from 'ddb';
const { pathutils } = ddb;

const MAX_VISIBLE = 5;

/**
 * ClipboardPanel - Floating panel displaying the current clipboard (cut/copy) state.
 *
 * Subscribes to the global clipboard composable and renders a summary of
 * the queued items with a "clear" action. Hides itself when the clipboard
 * is empty.
 */
export default {
    name: 'ClipboardPanel',

    computed: {
        isEmpty() { return clipboard.isEmpty.value; },
        isCut() { return clipboard.isCut.value; },
        count() { return clipboard.count.value; },
        items() { return clipboard.state.items; },
        source() { return clipboard.state.source; },
        visibleItems() {
            return this.items.slice(0, MAX_VISIBLE);
        },
        hiddenCount() {
            return Math.max(0, this.items.length - MAX_VISIBLE);
        }
    },

    methods: {
        basename(p) { return pathutils.basename(p); },
        clear() { clipboard.clear(); },
        iconFor(it) {
            if (it.type === ddb.entry.type.DIRECTORY) return 'fa-folder';
            return 'fa-file';
        }
    }
};
</script>

<style scoped>
.clipboard-panel {
    position: fixed;
    bottom: 1rem;
    right: 1rem;
    z-index: 998;
    width: 280px;
    background: var(--ddb-bg-elevated, #fff);
    border: 1px solid var(--ddb-border-color, #d0d7de);
    border-radius: var(--ddb-radius-md, 6px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
    padding: 0.6rem 0.8rem;
    font-size: 0.85rem;
}

.clipboard-panel.cut-mode {
    border-left: 3px solid #f59e0b;
}

.clipboard-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.4rem;
}

.clipboard-panel-title {
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
}

.clipboard-panel-mode {
    font-size: 0.7rem;
    text-transform: uppercase;
    background: rgba(0, 0, 0, 0.08);
    padding: 0.1rem 0.4rem;
    border-radius: 999px;
    margin-left: 0.3rem;
}

.cut-mode .clipboard-panel-mode {
    background: rgba(245, 158, 11, 0.18);
    color: #b45309;
}

.clipboard-panel-close {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--ddb-text-muted, #6e7781);
    padding: 0.2rem;
    border-radius: 4px;
}

.clipboard-panel-close:hover {
    background: rgba(0, 0, 0, 0.06);
    color: var(--ddb-text-primary, #24292f);
}

.clipboard-panel-source {
    color: var(--ddb-text-muted, #6e7781);
    font-size: 0.78rem;
    margin-bottom: 0.3rem;
    word-break: break-all;
}

.clipboard-panel-count {
    font-size: 0.78rem;
    color: var(--ddb-text-muted, #6e7781);
    margin-bottom: 0.4rem;
}

.clipboard-panel-list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 8rem;
    overflow-y: auto;
}

.clipboard-panel-item {
    padding: 0.18rem 0;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.clipboard-panel-more {
    font-style: italic;
    font-size: 0.78rem;
    color: var(--ddb-text-muted, #6e7781);
    padding-top: 0.2rem;
}

.clipboard-fade-enter-active,
.clipboard-fade-leave-active {
    transition: opacity 0.18s ease, transform 0.18s ease;
}

.clipboard-fade-enter-from,
.clipboard-fade-leave-to {
    opacity: 0;
    transform: translateY(8px);
}
</style>
