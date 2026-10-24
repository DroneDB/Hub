<template>
    <Breadcrumb v-if="crumbs.length > 0" class="path-breadcrumb" :home="home" :model="items" aria-label="Folder path">
        <template #item="{ item }">
            <button v-if="item.command" type="button" class="btn-reset bc-link"
                    :aria-label="item.icon ? 'Root folder' : undefined" @click="item.command()">
                <i v-if="item.icon" :class="item.icon" aria-hidden="true" />
                <template v-else>{{ item.label }}</template>
            </button>
            <span v-else class="bc-active" aria-current="location">{{ item.label }}</span>
        </template>
        <template #separator> / </template>
    </Breadcrumb>
</template>

<script setup>
/**
 * PathBreadcrumb - the folder trail above a file list (HQ-10: was copied in Explorer,
 * TableView and FolderPicker). Every folder but the last one is a button that emits
 * `navigate` with its path; the root is a home icon that emits `rootPath`.
 *
 *   <PathBreadcrumb :path="currentPath" root-path="/" @navigate="goTo" />
 */
import { computed } from 'vue';
import Breadcrumb from 'primevue/breadcrumb';
import pathutils from '@/libs/ddb/pathutils';

const props = defineProps({
    /** Current folder, '' or null at the root (shows nothing) */
    path: { type: String, default: '' },
    /** Path emitted by the home crumb */
    rootPath: { type: String, default: '' }
});

const emit = defineEmits(['navigate']);

const crumbs = computed(() => pathutils.crumbs(props.path));

const home = computed(() => (crumbs.value.length > 0
    ? { icon: 'fa-solid fa-home', command: () => emit('navigate', props.rootPath) }
    : null));

// The last crumb is the folder being shown: text, not a link
const items = computed(() => crumbs.value.map((c, idx, arr) => (idx < arr.length - 1
    ? { label: c.name, command: () => emit('navigate', c.path) }
    : { label: c.name })));
</script>

<style scoped lang="scss">
.path-breadcrumb {
    background: transparent;
    border: none;
    padding: 0;
    font-size: 1rem;

    :deep(.p-breadcrumb-separator) {
        color: var(--ddb-text-muted);
        margin: 0 0.25rem;
    }
}

.bc-link {
    color: var(--ddb-link);

    &:hover {
        text-decoration: underline;
    }
}

.bc-active {
    font-weight: 600;
}
</style>
