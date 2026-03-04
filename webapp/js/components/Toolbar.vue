<template>
    <PvToolbar :pt="{ root: { style: 'padding: 0.25rem; min-height: 2.125rem;' } }">
        <template #start>
            <template v-for="(tool, index) in startTools" :key="tool.id || 'start-' + index">
                <Divider v-if="tool.id === 'separator'" layout="vertical" />
                <Button v-else :icon="tool.icon" :title="tool.title" :disabled="tool.disabled"
                    :severity="tool.selected ? 'contrast' : 'secondary'" text size="small"
                    @click="toggleTool(tool.id)" />
            </template>
        </template>
        <template #end>
            <template v-for="(tool, index) in endTools" :key="tool.id || 'end-' + index">
                <Divider v-if="tool.id === 'separator'" layout="vertical" />
                <Button v-else :icon="tool.icon" :title="tool.title" :disabled="tool.disabled"
                    :severity="tool.selected ? 'contrast' : 'secondary'" text size="small"
                    @click="toggleTool(tool.id)" />
            </template>
        </template>
    </PvToolbar>
</template>

<script>
import Toolbar from 'primevue/toolbar';
import Button from 'primevue/button';
import Divider from 'primevue/divider';

export default {
    components: {
        PvToolbar: Toolbar,
        Button,
        Divider
    },
    props: ["tools", "className"],
    data: function () {
        return {
            dataTools: []
        }
    },
    computed: {
        spacerIndex: function () {
            return this.dataTools.findIndex(t => t.id === 'spacer');
        },
        startTools: function () {
            if (this.spacerIndex === -1) return this.dataTools;
            return this.dataTools.slice(0, this.spacerIndex);
        },
        endTools: function () {
            if (this.spacerIndex === -1) return [];
            return this.dataTools.slice(this.spacerIndex + 1);
        }
    },
    beforeMount: function () {
        this.refreshTools();
    },
    mounted: function () {
    },
    methods: {
        refreshTools: function () {
            // Make sure all keys are set for tools
            this.dataTools = [];
            (this.tools || []).forEach((t, idx) => {
                this.dataTools.push({
                    id: t.id || 'tool-' + idx,
                    icon: t.icon,
                    selected: t.selected || false,
                    disabled: t.disabled || false,
                    title: t.title || '',
                    onClick: t.onClick || false,
                    onSelect: t.onSelect || false,
                    onDeselect: t.onDeselect || false,
                    exclusiveGroup: t.exclusiveGroup,
                });

            });
        },

        getTool: function (toolId) {
            return this.dataTools.find(t => t.id === toolId);
        },

        selectTool: function (toolId) {
            const tool = this.getTool(toolId);
            if (tool.disabled) return;

            if (tool.onClick) {
                tool.onClick();
            }

            if (tool.onSelect) {
                tool.selected = true;
                tool.onSelect();
            }

            if (tool.exclusiveGroup) {
                this.dataTools.forEach(t => {
                    if (t !== tool && t.exclusiveGroup === tool.exclusiveGroup && t.selected) {
                        this.deselectTool(t.id);
                    }
                })
            }
        },

        deselectTool: function (toolId) {
            const tool = this.getTool(toolId);
            if (tool.disabled) return;

            if (tool.onClick) {
                tool.onClick();
            }

            tool.selected = false;
            if (tool.onDeselect) {
                tool.onDeselect();
            }
        },

        disableToolIf: function (toolId, disabled) {
            const tool = this.getTool(toolId);
            tool.disabled = disabled;
        },

        deselectAll: function () {
            this.dataTools.forEach(t => {
                if (t.selected) this.deselectTool(t.id);
            });
        },

        deselectNonToggle: function () {
            this.dataTools.forEach(t => {
                if (t.selected && !t.id.startsWith('toggle-')) this.deselectTool(t.id);
            });
        },

        toggleTool: function (toolId) {
            const tool = this.getTool(toolId);
            if (tool.disabled) return;

            if (tool.selected) this.deselectTool(toolId);
            else this.selectTool(toolId);
        }
    },

    watch: {
        tools: function (newVal, oldVal) {
            if (JSON.stringify(newVal) !== JSON.stringify(oldVal)) {
                this.refreshTools();
            }
        }
    }
}
</script>

<style scoped>
</style>
