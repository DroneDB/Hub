<template>
    <div class="compare-toolbar" role="toolbar" aria-label="Comparison">
        <div class="compare-title">
            <i class="fa-solid fa-table-columns" aria-hidden="true" />
            <span class="compare-name" :title="name">{{ name }}</span>
            <span v-if="dirty" class="compare-dirty" title="Unsaved changes">Unsaved changes</span>
        </div>
        <div class="compare-actions">
            <Button size="small" severity="secondary" icon="fa-solid fa-plus" label="Add raster"
                    :disabled="!canAdd || busy" :title="canAdd ? 'Add a georaster to the comparison' : `A comparison shows at most ${maxLayers} rasters`"
                    @click="emit('add')" />
            <Button size="small" severity="secondary" :icon="copied ? 'fa-solid fa-check' : 'fa-solid fa-link'" :label="copied ? 'Copied' : 'Copy link'"
                    :disabled="urlTooLong" :title="urlTooLong ? 'Save the comparison to share it: it is too large for a link' : 'Copy a link to this comparison'"
                    @click="emit('copyLink')" />
            <template v-if="canWrite">
                <Button size="small" icon="fa-solid fa-floppy-disk" label="Save" :disabled="busy" :loading="busy"
                        :title="saved ? 'Save the changes to this comparison' : 'Save this comparison in the dataset'" @click="emit('save')" />
                <Button v-if="saved" size="small" severity="secondary" label="Save as new" :disabled="busy"
                        title="Save as a new comparison" @click="emit('saveAsNew')" />
            </template>
        </div>
    </div>
    <ul v-if="notices.length || urlTooLong" class="compare-notices">
        <li v-if="urlTooLong" class="notice-info">
            This comparison is too large for a link. Save it to share it.
        </li>
        <li v-for="n in notices" :key="n.path + n.kind" :class="n.kind === 'changed' ? 'notice-info' : 'notice-warn'">
            <span class="notice-text">{{ n.text }}</span>
            <Button v-if="n.kind === 'missing'" size="small" text label="Pick another" @click="emit('repick', n.path)" />
            <Button v-if="n.kind !== 'changed' && layerCount > 1" size="small" text label="Remove" @click="emit('remove', n.path)" />
        </li>
    </ul>
</template>

<script setup>
/**
 * CompareToolbar - the compare view's bar: the comparison's name and unsaved state, Add
 * raster, Copy link, Save / Save as new (writers), and the notices about missing, unavailable
 * and changed layers.
 */
import Button from 'primevue/button';

defineProps({
    name: { type: String, required: true },
    dirty: { type: Boolean, default: false },
    saved: { type: Boolean, default: false },
    canWrite: { type: Boolean, default: false },
    canAdd: { type: Boolean, default: true },
    maxLayers: { type: Number, required: true },
    layerCount: { type: Number, default: 0 },
    busy: { type: Boolean, default: false },
    urlTooLong: { type: Boolean, default: false },
    copied: { type: Boolean, default: false },
    // [{ path, kind: 'missing' | 'unavailable' | 'changed', text }]
    notices: { type: Array, default: () => [] }
});
const emit = defineEmits(['add', 'copyLink', 'save', 'saveAsNew', 'repick', 'remove']);
</script>

<style scoped>
.compare-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.4rem 0.75rem;
    border-bottom: var(--ddb-border-width) solid var(--ddb-border);
    background: var(--ddb-bg);
}

.compare-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    flex: 1 1 12rem;
}

.compare-name {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.compare-dirty {
    flex-shrink: 0;
    font-size: var(--ddb-font-size-sm);
    color: var(--ddb-warning-text);
}

.compare-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
}

.compare-notices {
    list-style: none;
    margin: 0;
    padding: 0.25rem 0.75rem;
    border-bottom: var(--ddb-border-width) solid var(--ddb-border);
    font-size: var(--ddb-font-size-sm);

    li {
        display: flex;
        align-items: center;
        gap: 0.35rem;
        flex-wrap: wrap;
    }
}

.notice-text {
    min-width: 0;
    overflow-wrap: anywhere;
}

.notice-warn .notice-text {
    color: var(--ddb-warning-text);
}

.notice-info .notice-text {
    color: var(--ddb-text-muted);
}
</style>
