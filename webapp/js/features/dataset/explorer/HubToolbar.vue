<template>
    <PvToolbar :pt="{ root: { style: 'padding: 0.25rem; border-radius: 0; height: 2.8rem;' } }">
        <template #start>
            <template v-for="(tool, index) in startTools" :key="tool.id || 'start-' + index">
                <Divider v-if="tool.id === 'separator'" layout="vertical" />
                <Button v-else :icon="tool.icon" :title="tool.title || ''" :aria-label="tool.title || ''" :disabled="!!tool.disabled"
                        :severity="tool.selected ? 'contrast' : 'secondary'" text size="small"
                        @click="runTool(tool)" />
            </template>
        </template>
        <template #end>
            <template v-for="(tool, index) in endTools" :key="tool.id || 'end-' + index">
                <Divider v-if="tool.id === 'separator'" layout="vertical" />
                <Button v-else :icon="tool.icon" :title="tool.title || ''" :aria-label="tool.title || ''" :disabled="!!tool.disabled"
                        :severity="tool.selected ? 'contrast' : 'secondary'" text size="small"
                        @click="runTool(tool)" />
            </template>
        </template>
    </PvToolbar>
</template>

<script>
import Toolbar from 'primevue/toolbar';
import Button from 'primevue/button';
import Divider from 'primevue/divider';

/**
 * Toolbar - Icon-button toolbar with start and end tool groups.
 *
 * Renders straight from the declarative `tools` array (no local copy), so a click always runs the
 * onClick of the tools last passed in: the parent rebuilds them when the selection changes, and
 * their closures capture the item they act on. Supports separators, a `{ id: 'spacer' }` that
 * splits the start and end groups, a toggle state (`selected`, owned by the parent) and a
 * disabled state per tool.
 *
 * Props:
 *   tools - Array of { id, icon, title, disabled, selected, onClick } descriptors.
 */
export default {
    name: 'HubToolbar',
    components: {
        PvToolbar: Toolbar,
        Button,
        Divider
    },
    props: {
        tools: { type: Array, required: true }
    },
    computed: {
        spacerIndex: function () {
            return (this.tools || []).findIndex(t => t.id === 'spacer');
        },
        startTools: function () {
            const tools = this.tools || [];
            if (this.spacerIndex === -1) return tools;
            return tools.slice(0, this.spacerIndex);
        },
        endTools: function () {
            if (this.spacerIndex === -1) return [];
            return this.tools.slice(this.spacerIndex + 1);
        }
    },
    methods: {
        runTool: function (tool) {
            if (tool.disabled) return;
            tool.onClick?.();
        }
    }
}
</script>
