<template>
    <div class="geo-subfolder-chip" role="status" data-testid="geo-subfolder-chip">
        <i class="fa-solid fa-images" aria-hidden="true" />
        <span class="chip-text">{{ text }}</span>
        <button type="button" class="chip-action" data-testid="geo-subfolder-show" :aria-label="`Show ${folder}/ on the map`" @click="emit('show')">
            Show
        </button>
    </div>
</template>

<script setup>
/**
 * GeoSubfolderChip - over the empty map of a folder whose subfolder has the geo entries (FR-MAP-10):
 * "Photos are in images/ - Show". Show opens that subfolder (`show`); the page navigates its tree there.
 */
defineProps({
    /** The hint's sentence ("Photos are in images/") */
    text: { type: String, required: true },
    /** The subfolder it names */
    folder: { type: String, required: true }
});
const emit = defineEmits(['show']);
</script>

<style scoped>
/* Bottom centre of the map (MapCore's #overlay slot puts it in .map-container, which defines the reserves): above the
   bottom-left controls at any size, the scale bar (0.5rem up, about 3rem high) and the settings button, where a narrow
   or compact map brings them under the middle, and out of the toolbar rail on the right. It shows only for a folder
   with no geo entry, so with no layer panel, which takes the same place. Under the controls and the analysis panels. */
.geo-subfolder-chip {
    position: absolute;
    left: 50%;
    bottom: var(--map-bottom-reserve);
    transform: translateX(-50%);
    z-index: var(--map-layer-bottom-panel);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    box-sizing: border-box;
    max-width: calc(100% - 2 * var(--map-rail-reserve));
    padding: 0.35rem 0.5rem 0.35rem 0.85rem;
    border: var(--ddb-border-width) solid var(--ddb-border);
    border-radius: 999px;
    background: var(--ddb-bg-surface);
    color: var(--ddb-text);
    box-shadow: var(--ddb-shadow-sm);
    font-size: 0.9rem;
}

.chip-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.chip-action {
    flex-shrink: 0;
    padding: 0.2rem 0.75rem;
    border: none;
    border-radius: 999px;
    background: var(--ddb-primary);
    color: var(--ddb-text-on-dark);
    font-weight: 600;
    cursor: pointer;
}
</style>
