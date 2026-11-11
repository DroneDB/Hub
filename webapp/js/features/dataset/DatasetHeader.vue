<template>
    <header v-if="entry" class="dataset-header">
        <div class="title-row">
            <h1 class="dataset-title text-selectable">{{ name }}</h1>
            <VisibilityTag rounded :visibility="visibility" />
        </div>
        <p v-if="tagline" class="dataset-tagline text-selectable">{{ tagline }}</p>
    </header>
</template>

<script setup>
/**
 * DatasetHeader - the top of the dataset page (FR-EXP-14): the name of the dataset, its visibility and its tagline, from
 * the dataset's root entry (the name as the tree shows it: the display name, else the slug). It shows nothing until the
 * root entry is read.
 */
import { computed } from 'vue';
import ddb from 'ddb';
import VisibilityTag from '@/components/VisibilityTag.vue';

defineOptions({ name: 'DatasetHeader' });
const props = defineProps({
    /** The dataset's root entry ({ path, properties: { meta } }) */
    entry: { type: Object, default: null }
});

const meta = computed(() => props.entry?.properties?.meta ?? {});
const name = computed(() => (props.entry ? ddb.utils.entryLabel(props.entry) : ''));
// The server keeps the visibility as the number of ddb.Visibility (a stored one can come as text)
const visibility = computed(() => (meta.value.visibility?.data == null ? null : Number(meta.value.visibility.data)));
const tagline = computed(() => String(meta.value.tagline?.data ?? '').trim());
</script>

<style scoped>
.dataset-header {
    flex: none;
    padding: var(--ddb-spacing-sm) var(--ddb-spacing-md);
    border-bottom: var(--ddb-border-width) solid var(--ddb-border);
    background: var(--ddb-bg-surface);
}

.title-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ddb-spacing-sm);
}

.dataset-title {
    margin: 0;
    min-width: 0;
    font-size: var(--ddb-font-size-xl);
    font-weight: 600;
    line-height: 1.3;
    overflow-wrap: anywhere;
}

.dataset-tagline {
    margin: var(--ddb-spacing-xs) 0 0;
    color: var(--ddb-text-secondary);
    overflow-wrap: anywhere;
}
</style>
