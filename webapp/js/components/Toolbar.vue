<template>
    <div class="toolbar" :class="className">
        <template v-for="(tool, index) in dataTools">
            <div class="separator" v-if="tool.id === 'separator'" :key="'sep-' + index"></div>
            <div class="spacer" v-else-if="tool.id === 'spacer'" :key="'spacer-' + index"></div>
            <div v-else class="button" :class="{ selected: tool.selected, disabled: tool.disabled }" :title="tool.title"
                @click="toggleTool(tool.id)" :key="tool.id">
                <i :class="'icon ' + tool.icon"></i>
            </div>
        </template>
    </div>
</template>

<script>

export default {
    props: ["tools", "className"],
    data: function () {
        return {
            dataTools: []
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
.toolbar {
    user-select: none;
    -webkit-user-select: none;
    z-index: 0;

    display: flex;
    background-image: linear-gradient(#fefefe, #f3f3f3);

    &.plain {
        background: #fefefe;
        border-bottom: 1px solid #030A03;
    }

    flex-direction: row;
    padding: 0.25rem;
    min-height: 2.125rem;

    .button {
        padding: 0;
        width: 1.625rem;
        height: 1.625rem;
        padding-left: 0.25rem;
        padding-right: 0.25rem;
        border-radius: 0.25rem;

        @media only screen and (max-width: 575.98px) {
            width: 2.1875rem;
            height: 2.125rem;
            padding-left: 0.4375rem;
            padding-right: 0.375rem;
            padding-top: 0.125rem;
        }

        margin-right: 0.0625rem;
        border: 1px solid transparent;

        &.selected {
            cursor: pointer;
            border-color: #030A03;
            background: #fefefe;
        }

        @media (hover: hover) {
            &:hover {
                cursor: pointer;
                border-color: #030A03;
                background: #fefefe;
            }
        }

        &:active {
            background: #f8f8f8;
        }

        i {
            padding-top: 0.1875rem;
            padding-left: 0;
            margin: 0;
        }

        &.disabled {
            opacity: 0.2;

            &:hover,
            &:active,
            &:focus,
            &.selected {
                cursor: not-allowed;
            }
        }
    }

    &.large {
        height: 2.75rem;

        .button {
            width: 2.25rem;
            height: 2.25rem;
            padding-left: 0.125rem;
            padding-right: 0.125rem;
            padding-top: 0.125rem;
            padding-bottom: 0.125rem;
        }

        i {
            font-size: 200%;
        }
    }

    &.top-border {
        border-top: 1px solid #030A03;
    }

    .separator {
        border-left: 1px solid #dddddd;
        margin-top: 0.3125rem;
        margin-bottom: 0.1875rem;
        margin-left: 0.375rem;
        margin-right: 0.375rem;
    }

    .spacer {
        flex-grow: 1;
    }
}
</style>
