<template>
    <PvToolbar class="hub-toolbar" :pt="{ root: { style: 'padding: 0.25rem; border-radius: 0; min-height: 2.8rem; flex-wrap: nowrap;' } }">
        <template #start>
            <template v-for="(tool, index) in startTools" :key="tool.id || 'start-' + index">
                <Divider v-if="tool.id === 'separator'" layout="vertical" />
                <ActionButton v-else :label="tool.title || ''" :icon="tool.icon" :show-label="labelled(tool)"
                              :disabled="!!tool.disabled" :disabled-reason="tool.disabledReason || ''" :pressed="tool.pressed"
                              :severity="tool.pressed ? 'contrast' : 'secondary'" text size="small"
                              :data-tool="tool.id" @click="runTool(tool)">
                    <template v-if="tool.text" #default>{{ tool.text }}</template>
                </ActionButton>
            </template>
        </template>
        <template #end>
            <template v-for="(tool, index) in endTools" :key="tool.id || 'end-' + index">
                <Divider v-if="tool.id === 'separator'" layout="vertical" />
                <ActionButton v-else :label="tool.title || ''" :icon="tool.icon" :show-label="labelled(tool)"
                              :disabled="!!tool.disabled" :disabled-reason="tool.disabledReason || ''" :pressed="tool.pressed"
                              :severity="tool.pressed ? 'contrast' : 'secondary'" text size="small"
                              :data-tool="tool.id" @click="runTool(tool)">
                    <template v-if="tool.text" #default>{{ tool.text }}</template>
                </ActionButton>
            </template>
            <template v-if="overflowTools.length">
                <ActionButton label="More" icon="fa-solid fa-ellipsis-vertical" severity="secondary" text size="small"
                              aria-haspopup="true" :aria-controls="moreMenuId" :aria-expanded="String(moreOpen)"
                              data-tool="more" @click="toggleMore" />
                <PvMenu :id="moreMenuId" ref="moreMenu" :model="overflowModel" :pt="moreMenuPt" popup
                        @show="moreOpen = true" @hide="moreOpen = false" />
            </template>
        </template>
    </PvToolbar>
</template>

<script>
import { useId } from 'vue';
import Toolbar from 'primevue/toolbar';
import Menu from 'primevue/menu';
import Divider from 'primevue/divider';
import ActionButton from '@/components/ActionButton.vue';
import { BREAKPOINT_PX } from '@/libs/responsiveColumns';
import { useResizeObserver } from '@/composables/useEventListener';

/** The tools of priority up to this stay on the toolbar at a width; the others go to More. */
function levelOf(width) {
    if (width == null) return 3;
    if (width < BREAKPOINT_PX.sm) return 1;
    if (width < BREAKPOINT_PX.lg) return 2;
    return 3;
}

const STRUCTURAL = new Set(['separator', 'spacer']);

// No separator at either end of a group or next to another
const collapseSeparators = tools => tools.filter((t, i) => t.id !== 'separator'
    || (i > 0 && i < tools.length - 1 && !STRUCTURAL.has(tools[i - 1].id) && !STRUCTURAL.has(tools[i + 1].id)));

/**
 * Toolbar - the button bar of a list, with start and end tool groups.
 *
 * Renders straight from the declarative `tools` array (no local copy), so a click always runs the
 * onClick of the tools last passed in: the parent rebuilds them when the selection changes. A
 * `{ id: 'separator' }` draws a line, a `{ id: 'spacer' }` splits the start and end groups.
 *
 * The toolbar never wraps. Each tool has a `priority`: 1 stays on the toolbar when it is narrower
 * than the `sm` breakpoint (a phone), 2 when it is narrower than `lg` (a tablet), 3 only when it is
 * wider; the tools that do not fit go into a "More" menu built from the same descriptors. A tool
 * with `showLabel` shows its title next to its icon on a wide toolbar. A disabled tool stays
 * focusable and gives its `disabledReason` (ActionButton); a toggle gives `pressed` (a check item in More).
 *
 * Props:
 *   tools - Array of { id, icon, title, disabled, disabledReason, pressed, priority, showLabel, onClick }.
 */
export default {
    name: 'HubToolbar',
    components: {
        PvToolbar: Toolbar,
        PvMenu: Menu,
        ActionButton,
        Divider
    },
    props: {
        tools: { type: Array, required: true }
    },
    setup() {
        return { moreMenuId: useId() };
    },
    data() {
        return {
            // The toolbar's width; null until measured (every tool shows)
            width: null,
            moreOpen: false
        };
    },
    computed: {
        level() {
            return levelOf(this.width);
        },
        // The tools on the toolbar at this width (a tool without a priority always is)
        shownTools() {
            return collapseSeparators((this.tools || []).filter(t => STRUCTURAL.has(t.id) || (t.priority ?? 1) <= this.level));
        },
        overflowTools() {
            return (this.tools || []).filter(t => !STRUCTURAL.has(t.id) && (t.priority ?? 1) > this.level);
        },
        // A toggle (a tool with `pressed`) is a check item: a check where the toolbar shows it pressed, in place of its icon
        overflowModel() {
            return this.overflowTools.map(tool => ({
                label: tool.disabled && tool.disabledReason ? `${tool.title} (${tool.disabledReason})` : tool.title,
                icon: tool.pressed === undefined ? tool.icon : 'fa-solid fa-check',
                disabled: !!tool.disabled,
                ...(tool.pressed === undefined ? {} : { checked: !!tool.pressed }),
                command: () => this.runTool(tool)
            }));
        },
        // The check items say their state (menuitemcheckbox, aria-checked); an unchecked one keeps the room of its check
        moreMenuPt() {
            const checkable = item => typeof item?.checked === 'boolean';
            return {
                item: ({ context }) => (checkable(context.item)
                    ? { role: 'menuitemcheckbox', 'aria-checked': String(context.item.checked) } : {}),
                itemIcon: ({ context }) => (checkable(context.item) && !context.item.checked
                    ? { style: { visibility: 'hidden' } } : {})
            };
        },
        spacerIndex() {
            return this.shownTools.findIndex(t => t.id === 'spacer');
        },
        startTools() {
            if (this.spacerIndex === -1) return this.shownTools;
            return this.shownTools.slice(0, this.spacerIndex);
        },
        endTools() {
            if (this.spacerIndex === -1) return [];
            return this.shownTools.slice(this.spacerIndex + 1);
        }
    },
    mounted() {
        // Disconnected with the component
        useResizeObserver(this.$el, entries => {
            const width = entries[0]?.contentRect?.width ?? 0;
            if (width > 0) this.width = width;
        });
    },
    methods: {
        labelled(tool) {
            return !!tool.showLabel && this.level === 3;
        },
        runTool(tool) {
            if (tool.disabled) return;
            tool.onClick?.();
        },
        toggleMore(event) {
            this.$refs.moreMenu?.toggle(event);
        }
    }
};
</script>

<style scoped>
.hub-toolbar :deep(.p-toolbar-start),
.hub-toolbar :deep(.p-toolbar-end) {
    flex-wrap: nowrap;
    min-width: 0;
}
</style>
