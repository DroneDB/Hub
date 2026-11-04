<template>
    <PrimeContextMenu ref="ctxMenu" :model="menuModel" />
</template>

<script>
import PrimeContextMenu from 'primevue/contextmenu';
import Keyboard from '@/libs/keyboard';

let contextMenus = [];

/**
 * ContextMenu - Right-click context menu backed by PrimeVue ContextMenu.
 *
 * Opens on right clicks inside the element it is placed in. Manages a global stack so
 * only one menu is visible at a time.
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
            return this.items
                .filter(itm => {
                    if (itm.items) {
                        // Sub-menu: visible if at least one child is visible
                        return itm.items.some(child => typeof child.isVisible === 'undefined' || child.isVisible());
                    }
                    return typeof itm.isVisible === 'undefined' || itm.isVisible();
                })
                .map(item => this.mapItem(item))
                .filter(Boolean);
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

<style scoped></style>
