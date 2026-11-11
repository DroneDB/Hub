<template>
    <nav v-if="crumbs.length > 0" class="hub-breadcrumb" aria-label="Breadcrumb">
        <ol>
            <li v-for="crumb in crumbs" :key="crumb.id" :class="{ 'is-current': crumb.current }">
                <span v-if="crumb.current" class="crumb crumb-current" :title="crumb.label" aria-current="page">{{ crumb.label }}</span>
                <RouterLink v-else-if="crumb.to" class="crumb crumb-link" :to="crumb.to" :title="crumb.label">{{ crumb.label }}</RouterLink>
                <span v-else class="crumb" :title="crumb.label">{{ crumb.label }}</span>
            </li>
        </ol>
    </nav>
</template>

<script setup>
/**
 * HubBreadcrumb - where the user is, in the header (FR-NAV-03): Organizations / <organization> / <dataset>, on the
 * pages of an organization, of a dataset and of its viewers. Every crumb but the last is a link; the last one names
 * the page (aria-current).
 *
 * The slugs come from the route (`org`, `ds`). The name of the organization is read here (the organization look-up, which
 * the user did not ask for: it opts out of the global 401 redirect, FR-XC-05); the name of the dataset is the one the page
 * puts in the dataset session (stores/datasetSession.js: the dataset page, and a viewer from the dataset info it reads),
 * formatted as the tree shows it. Until a name is known, and when it cannot be read (no access, an error), the crumb shows the
 * slug; an organization the visitor has no access to is not a link, since the page would only refuse them. In a
 * one-organization install the organization is home, so there is no Organizations crumb.
 *
 *   <HubBreadcrumb :org="$route.params.org" :ds="$route.params.ds" />
 */
import { computed, ref, watch } from 'vue';
import ddb from 'ddb';
import reg from '@/libs/api/sharedRegistry';
import { isForbidden, isUnauthorized } from '@/libs/ddb/apiError';
import { homeLocation } from '@/libs/authRoutes';
import { useDatasetSessionStore } from '@/stores/datasetSession';

defineOptions({ name: 'HubBreadcrumb' });

const props = defineProps({
    /** Slug of the organization (the route's `org`); no breadcrumb without one */
    org: { type: String, default: '' },
    /** Slug of the dataset (the route's `ds`); the last crumb is the organization without one */
    ds: { type: String, default: '' }
});

const session = useDatasetSessionStore();

// The organization asked for: its name, or why there is none
const orgName = ref('');
const orgDenied = ref(false);
let request = 0;

watch(() => props.org, async org => {
    const mine = ++request;
    orgName.value = '';
    orgDenied.value = false;
    if (!org) return;
    try {
        const info = await reg.Organization(org).info({ skipUnauthorized: true });
        if (mine === request) orgName.value = String(info?.name ?? '').trim();
    } catch (e) {
        // No access (a visitor of a shared dataset of a private organization): the slug, and no link. Any other
        // failure: the slug too, the page may still open
        if (mine === request) orgDenied.value = isUnauthorized(e) || isForbidden(e);
    }
}, { immediate: true });

// The name of the dataset as the tree shows it, from the page's root entry
const datasetName = computed(() => (session.rootEntry && !session.unavailable ? ddb.utils.entryLabel(session.rootEntry) : ''));

const crumbs = computed(() => {
    if (!props.org) return [];
    const home = homeLocation();
    /** @type {Array<{ id: string, label: string, to?: import('vue-router').RouteLocationRaw, current?: boolean }>} */
    const list = [];
    if (home.name === 'Organizations') list.push({ id: 'organizations', label: 'Organizations', to: { name: 'Organizations' } });
    list.push({
        id: 'org',
        label: orgName.value || props.org,
        to: orgDenied.value ? undefined : { name: 'Datasets', params: { org: props.org } },
        current: !props.ds
    });
    if (props.ds) list.push({ id: 'ds', label: datasetName.value || props.ds, current: true });
    return list;
});
</script>

<style scoped>
.hub-breadcrumb {
    min-width: 0;
}

ol {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    min-width: 0;
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: var(--ddb-font-size-sm);
}

li {
    display: flex;
    align-items: center;
    min-width: 0;
}

/* The separator is drawn, not text: a screen reader reads the list */
li + li::before {
    content: "/";
    padding: 0 var(--ddb-spacing-xs);
    color: var(--ddb-text-secondary);
}

.crumb {
    min-width: 0;
    max-width: 16rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* The page's own name takes the room the links leave */
.is-current {
    flex: 1 1 auto;
}

.is-current .crumb {
    max-width: none;
}

.crumb-link {
    color: var(--ddb-text-secondary);
    text-decoration: none;
}

.crumb-link:hover {
    color: var(--ddb-text);
    text-decoration: underline;
}

.crumb-current {
    color: var(--ddb-text);
    font-weight: 600;
}
</style>
