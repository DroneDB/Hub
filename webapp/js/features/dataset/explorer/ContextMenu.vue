<template>
    <PrimeContextMenu ref="ctxMenu" :model="menuModel">
        <template #item="{ item, props, hasSubmenu }">
            <a v-bind="props.action" :class="{ 'menu-danger': item.danger }" :aria-keyshortcuts="item.keyShortcuts">
                <span v-if="item.icon" v-bind="props.icon" />
                <span v-bind="props.label">{{ item.label }}</span>
                <span v-if="item.shortcut" class="menu-shortcut" aria-hidden="true">{{ item.shortcut }}</span>
                <i v-if="hasSubmenu" class="fa-solid fa-angle-right menu-submenu-icon" aria-hidden="true" />
            </a>
        </template>
    </PrimeContextMenu>
</template>

<script>
import PrimeContextMenu from 'primevue/contextmenu';
import Keyboard from '@/libs/keyboard';
import { acceleratorLabel, ariaKeyShortcuts } from '@/libs/dataset/explorerActions';

const isShown = item => typeof item.isVisible === 'undefined' || item.isVisible();

let contextMenus = [];

/**
 * ContextMenu - Right-click context menu backed by PrimeVue ContextMenu.
 *
 * Opens on right clicks inside the element it is placed in. Manages a global stack so
 * only one menu is visible at a time. Items of different `group`s are parted by a separator;
 * an item with an `accelerator` shows its key on the right, and a `danger` item is drawn red.
 * Closes on Escape via the Keyboard utility.
 *
 * Props:
 *   items - Array of PrimeVue MenuItem descriptors for the menu model.
 */
export default {
    components: {
        PrimeContextMenu
    },
    props: {
        items: {
            type: Array,
            required: true
        }
    },
    data: function () {
        return {};
    },

    computed: {
        menuModel: function () {
            const model = [];
            let group;
            for (const item of this.items) {
                // Sub-menu: visible if at least one child is visible
                if (item.items ? !item.items.some(isShown) : !isShown(item)) continue;
                const mapped = this.mapItem(item);
                if (!mapped) continue;
                if (model.length && item.group !== group && !mapped.separator) model.push({ separator: true });
                group = item.group;
                model.push(mapped);
            }
            return model;
        }
    },

    mounted: function () {
        // The menu opens on right clicks in the element it is placed in (the host's root)
        this._target = this.$el.parentElement;
        this._target.addEventListener('contextmenu', this.openContextMenu, false);
        Keyboard.onKeyDown(this.handleKeyDown);
        contextMenus.push(this);
    },

    beforeUnmount: function () {
        this._target.removeEventListener('contextmenu', this.openContextMenu);
        Keyboard.offKeyDown(this.handleKeyDown);
        contextMenus = contextMenus.filter(cm => cm !== this);
    },

    methods: {
        mapItem: function (item) {
            if (item.type === 'separator') {
                return { separator: true };
            }
            if (item.items) {
                const children = item.items
                    .filter(child => typeof child.isVisible === 'undefined' || child.isVisible())
                    .map(child => this.mapItem(child))
                    .filter(Boolean);
                if (children.length === 0) return null;
                return {
                    label: item.label,
                    icon: item.icon,
                    items: children
                };
            }
            return {
                label: item.label,
                icon: item.icon,
                shortcut: item.accelerator ? acceleratorLabel(item.accelerator) : undefined,
                keyShortcuts: item.accelerator ? ariaKeyShortcuts(item.accelerator) : undefined,
                danger: !!item.danger,
                disabled: item.isEnabled !== undefined ? !item.isEnabled() : false,
                command: () => {
                    if (item.click) item.click();
                }
            };
        },

        openContextMenu: function (e) {
            e.preventDefault();
            e.stopPropagation();

            // Close others
            contextMenus.forEach(cm => {
                if (cm !== this && cm.$refs.ctxMenu) cm.$refs.ctxMenu.hide();
            });

            if (this.$refs.ctxMenu) {
                this.$refs.ctxMenu.show(e);
            }
        },

        handleKeyDown: function (e) {
            if (e.keyCode === 27) {
                if (this.$refs.ctxMenu) this.$refs.ctxMenu.hide();
            }
        }
    }
}
</script>

<style scoped>
.menu-shortcut {
    margin-left: auto;
    padding-left: 1.5rem;
    font-size: 0.85em;
    color: var(--ddb-text-muted);
}

.menu-submenu-icon {
    margin-left: auto;
    padding-left: 1rem;
    font-size: 0.75em;
}

.menu-danger,
.menu-danger .p-contextmenu-item-icon {
    color: var(--ddb-danger);
}
</style>
