<template>
    <div class="explorer-location">
        <PathBreadcrumb :path="path" :root-path="rootPath" show-root class="explorer-location-path" @navigate="$emit('navigate', $event)" />
        <div v-if="tools.length" class="explorer-location-tools">
            <ActionButton v-for="tool in tools" :key="tool.id" :label="tool.title || ''" :icon="tool.icon"
                          :disabled="!!tool.disabled" :disabled-reason="tool.disabledReason || ''"
                          severity="secondary" text size="small" :data-tool="tool.id" @click="tool.onClick?.()" />
        </div>
    </div>
</template>

<script setup>
/**
 * ExplorerLocationBar - the row above a file list: the path of the folder shown and, at its end, the actions on that
 * folder (Refresh). The row is there in every folder, the root too, so its buttons keep their place.
 *
 *   <ExplorerLocationBar :path="currentPath" root-path="/" :tools="locationTools" @navigate="goTo" />
 *
 * `tools` are descriptors of libs/dataset/explorerTools (locationTools): { id, title, icon, disabled,
 * disabledReason, onClick }.
 */
import PathBreadcrumb from '@/components/PathBreadcrumb.vue';
import ActionButton from '@/components/ActionButton.vue';

defineProps({
    /** Current folder, '' or null at the root */
    path: { type: String, default: '' },
    /** Path emitted by the home crumb */
    rootPath: { type: String, default: '' },
    tools: { type: Array, default: () => [] }
});

defineEmits(['navigate']);
</script>

<style scoped lang="scss">
.explorer-location {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 2.5rem;
}

.explorer-location-path {
    flex: 1 1 auto;
    min-width: 0;
}

.explorer-location-tools {
    display: flex;
    flex: 0 0 auto;
}
</style>
