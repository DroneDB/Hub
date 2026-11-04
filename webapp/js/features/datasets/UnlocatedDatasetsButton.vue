<template>
    <!-- The window is teleported to the body: only the button takes a place in the toolbar -->
    <div v-if="datasets.length" class="udb">
        <Button severity="secondary" outlined size="small" class="udb-button"
                :title="summary" :aria-label="summary" aria-haspopup="dialog" @click="open = true">
            <i class="fa-solid fa-map-pin" aria-hidden="true" />
            <span class="udb-label">No location</span>
            <Badge :value="datasets.length" severity="secondary" />
        </Button>

        <Window v-if="open" title="Datasets without a location" modal fixed-position close-modal-on-click
                width="34rem" height="auto" close-button cancel-label="Close" @close="open = false">
            <p class="udb-intro">
                {{ summary }}. A dataset is on the map when it has georeferenced files: photos with a GPS
                position, orthophotos, point clouds, models or vector layers.
            </p>

            <IconField v-if="searchable" class="mb-2">
                <InputIcon class="fa-solid fa-magnifying-glass" />
                <InputText v-model="query" placeholder="Search" aria-label="Search the datasets without a location" fluid />
            </IconField>

            <VirtualScroller v-if="shown.length" v-slot="{ item }" class="udb-list" :items="shown" :item-size="ROW_HEIGHT" :min-height="0"
                             :style="{ '--udb-row-height': `${ROW_HEIGHT}px` }"
                             role="list" aria-label="Datasets without a location">
                <div class="udb-item" role="listitem">
                    <router-link :to="{ name: 'ViewDataset', params: { org: item.org, ds: item.slug } }" class="udb-row" @click="open = false">
                        <span class="udb-icon" aria-hidden="true"><i class="fa-solid fa-database" /></span>
                        <span class="udb-text">
                            <span class="udb-name">{{ item.name }}</span>
                            <span v-if="detailOf(item)" class="udb-detail">{{ detailOf(item) }}</span>
                        </span>
                        <i class="fa-solid fa-chevron-right udb-chevron" aria-hidden="true" />
                    </router-link>
                </div>
            </VirtualScroller>
            <EmptyState v-else title="No datasets match" filtered />
        </Window>
    </div>
</template>

<script setup>
/**
 * UnlocatedDatasetsButton - the datasets that have no pin on the map, behind a button with their
 * number beside the List/Map switch. The button opens a window that lists them, searchable when
 * there are many, each row opening its dataset. Nothing shows while every dataset has a location.
 *
 *   <UnlocatedDatasetsButton :groups="locationGroups" show-organization />
 */
import { computed, ref } from 'vue';
import Badge from 'primevue/badge';
import Button from 'primevue/button';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';
import InputText from 'primevue/inputtext';
import Window from '@/components/HubWindow.vue';
import VirtualScroller from '@/components/VirtualScroller.vue';
import EmptyState from '@/components/EmptyState.vue';
import { unlocatedDatasets } from '@/libs/map/datasetPlaces';

defineOptions({ name: 'UnlocatedDatasetsButton' });

const props = defineProps({
    /** The datasets by organization, as the map takes them: [{ org, orgName, datasets: [{ slug, name, bbox }] }] */
    groups: { type: Array, default: () => [] },
    /** Name the organization of each dataset (a page of several organizations) */
    showOrganization: { type: Boolean, default: false }
});

// The height of a row in pixels (the list only renders the rows in view); it fits two lines of
// text at the larger font of a phone
const ROW_HEIGHT = 64;
// From this many datasets the window has a search field
const SEARCH_FROM = 8;

const open = ref(false);
const query = ref('');

const datasets = computed(() => unlocatedDatasets(props.groups));
const summary = computed(() => {
    const count = datasets.value.length;
    return `${count} ${count === 1 ? 'dataset has' : 'datasets have'} no location`;
});
const searchable = computed(() => datasets.value.length >= SEARCH_FROM);

const shown = computed(() => {
    const words = query.value.trim().toLowerCase();
    if (!searchable.value || !words) return datasets.value;
    return datasets.value.filter(dataset => [dataset.name, dataset.slug, props.showOrganization ? dataset.orgName : '']
        .some(text => text.toLowerCase().includes(words)));
});

/** The second line of a row: the organization, and the slug when the name is not it. */
function detailOf(dataset) {
    return [props.showOrganization ? dataset.orgName : null, dataset.name !== dataset.slug ? dataset.slug : null]
        .filter(Boolean).join(' · ');
}
</script>

<style scoped>
.udb {
    display: contents;
}

.udb-button {
    flex-shrink: 0;
    gap: var(--ddb-spacing-xs);
}


.udb-intro {
    margin: 0 0 var(--ddb-spacing-md);
    color: var(--ddb-text-secondary);
    font-size: 0.875rem;
}

/* Half a row shows below the last whole one, so the list reads as one that scrolls */
.udb-list {
    max-height: min(calc(6.5 * var(--udb-row-height)), 55dvh);
    margin: 0 calc(-1 * var(--ddb-spacing-xs));
}

.udb-item {
    height: 100%;
    padding: 0.125rem var(--ddb-spacing-xs);
}

.udb-row {
    display: flex;
    align-items: center;
    gap: var(--ddb-spacing-md);
    height: 100%;
    padding: 0 var(--ddb-spacing-md) 0 var(--ddb-spacing-sm);
    border: var(--ddb-border-width) solid var(--ddb-border-separator);
    border-radius: var(--ddb-radius-md);
    background: var(--ddb-bg-surface);
    color: var(--ddb-text);
    text-decoration: none;
    transition: background-color 0.15s, border-color 0.15s;
}

.udb-row:hover {
    background: var(--ddb-selected-bg);
    border-color: var(--ddb-primary-200);
}

.udb-row:focus-visible {
    outline: 2px solid var(--ddb-primary);
    outline-offset: -2px;
}

.udb-icon {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: var(--ddb-radius-md);
    background: var(--ddb-primary-50);
    color: var(--ddb-primary);
}

.udb-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.3;
}

.udb-name {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.udb-detail {
    color: var(--ddb-text-secondary);
    font-size: 0.8125rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.udb-chevron {
    flex-shrink: 0;
    color: var(--ddb-text-muted);
    font-size: 0.75rem;
    transition: transform 0.15s, color 0.15s;
}

.udb-row:hover .udb-chevron {
    color: var(--ddb-primary);
    transform: translateX(0.125rem);
}

/* Only the icon and the number on a narrow screen, like the List/Map switch beside it */
@media screen and (max-width: 575.98px) {
    .udb-label {
        display: none;
    }
}
</style>
