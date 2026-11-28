<template>
    <div class="dataset-image-picker">
        <form class="picker-search" role="search" @submit.prevent="search">
            <label :for="`${idPrefix}-query`" class="visually-hidden">Image name</label>
            <InputText :id="`${idPrefix}-query`" v-model="query" type="search" placeholder="Part of the name" autocomplete="off" class="picker-query" />
            <Button type="submit" label="Search" severity="secondary" :loading="loading" />
        </form>

        <p v-if="loading" class="picker-state" role="status">Looking for {{ noun }}...</p>
        <p v-else-if="error" class="picker-state" role="alert">
            {{ error }}
            <Button label="Retry" severity="secondary" size="small" class="ms-2" @click="search" />
        </p>
        <p v-else-if="searched && !results.length" class="picker-state" role="status">No {{ noun }} found</p>

        <ul v-if="results.length" class="picker-results" :aria-label="`${capitalized} of the dataset (${results.length})`">
            <li v-for="entry in results" :key="entry.path" class="picker-row">
                <img class="picker-thumb" :src="dataset.thumbUrl(entry.path, 96, entry.hash)" alt="" width="48" height="48" loading="lazy">
                <span class="picker-name" :title="entry.path">{{ entry.path }}</span>
                <ActionButton :label="`${actionLabel} ${entry.path}`" severity="secondary" size="small" :disabled="!!blockedReasonOf(entry.path)"
                              :disabled-reason="blockedReasonOf(entry.path)" @click="$emit('pick', entry.path)">
                    <i :class="actionIcon" aria-hidden="true" /> {{ actionLabel }}
                </ActionButton>
            </li>
        </ul>
    </div>
</template>

<script setup>
/**
 * A file of the dataset to pick (an image as a photo of an annotation, a file whose thumbnail becomes the dataset cover):
 * a search by part of the name over the whole dataset (the first 50 by path) of the entry types asked for, each result
 * with its thumbnail and an action. A path that is taken, or any when nothing can be picked now, is disabled with the
 * reason. Emits `pick` with the path.
 */
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import ActionButton from '@/components/ActionButton.vue';
import { findEntries, IMAGE_TYPES } from '@/libs/findEntries';

const props = defineProps({
    dataset: { type: Object, required: true },
    /** The entry types to look for (the images by default) */
    types: { type: Array, default: () => IMAGE_TYPES },
    /** Whether a path found is offered (all are by default) */
    accepts: { type: Function, default: () => true },
    /** What the results are, plural and lowercase: the messages and the label of the list say it */
    noun: { type: String, default: 'images' },
    /** The action of a result, and its icon */
    actionLabel: { type: String, default: 'Add' },
    actionIcon: { type: String, default: 'fa-solid fa-plus' },
    /** The paths that cannot be picked again (the photos the annotation has) */
    taken: { type: Array, default: () => [] },
    /** Why nothing can be picked now ('' when something can) */
    blockedReason: { type: String, default: '' },
    /** Why a taken path cannot be picked */
    takenReason: { type: String, default: 'Already in this annotation' },
    idPrefix: { type: String, default: 'photo-pick' }
});
defineEmits(['pick']);

const query = ref('');
const results = ref(/** @type {any[]} */ ([]));
const loading = ref(false);
const error = ref('');
const searched = ref(false);
const capitalized = computed(() => props.noun.charAt(0).toUpperCase() + props.noun.slice(1));
let controller = /** @type {AbortController | null} */ (null);

function blockedReasonOf(path) {
    if (props.taken.includes(path)) return props.takenReason;
    return props.blockedReason;
}

async function search() {
    controller?.abort();
    const mine = (controller = new AbortController());
    loading.value = true;
    error.value = '';
    try {
        const found = await findEntries(props.dataset, query.value, { types: props.types, signal: mine.signal });
        if (mine !== controller) return;
        results.value = found.filter(entry => props.accepts(entry.path));
        searched.value = true;
    } catch (e) {
        if (mine !== controller || mine.signal.aborted) return;
        results.value = [];
        error.value = `The ${props.noun} could not be listed: ${e?.message || e}`;
    } finally {
        if (mine === controller) loading.value = false;
    }
}

onMounted(search);
onBeforeUnmount(() => controller?.abort());
</script>

<style scoped>
.picker-search {
    display: flex;
    gap: var(--ddb-spacing-xs);
    margin-bottom: var(--ddb-spacing-sm);
}

.picker-query {
    flex: 1;
    min-width: 0;
}

.picker-state {
    margin: var(--ddb-spacing-sm) 0;
    color: var(--ddb-text-secondary);
}

.picker-results {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 14rem;
    overflow-y: auto;
}

.picker-row {
    display: flex;
    align-items: center;
    gap: var(--ddb-spacing-sm);
    padding: var(--ddb-spacing-xs) 0;
    border-bottom: var(--ddb-border-width) solid var(--ddb-border);
}

.picker-thumb {
    flex: none;
    width: 3rem;
    height: 3rem;
    object-fit: cover;
    border-radius: var(--ddb-radius-sm);
    background: var(--ddb-bg-subtle);
}

.picker-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
</style>
