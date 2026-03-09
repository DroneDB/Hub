<template>
    <PrimeContextMenu ref="ctxMenu" :model="menuModel" />
</template>

<script>
import PrimeContextMenu from 'primevue/contextmenu';
import Keyboard from '@/libs/keyboard';

let contextMenus = [];

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
                .filter(itm => typeof itm.isVisible === 'undefined' || itm.isVisible())
                .map(item => {
                    if (item.type === 'separator') {
                        return { separator: true };
                    }
                    return {
                        label: item.label,
                        icon: item.icon,
                        disabled: item.isEnabled !== undefined ? !item.isEnabled() : false,
                        command: () => {
                            if (item.click) item.click();
                        }
                    };
                });
        }
    },

    mounted: function () {
        this.$parent.$el.addEventListener('contextmenu', this.openContextMenu, false);
        Keyboard.onKeyDown(this.handleKeyDown);
        contextMenus.push(this);
    },

    beforeUnmount: function () {
        this.$parent.$el.removeEventListener('contextmenu', this.openContextMenu);
        Keyboard.offKeyDown(this.handleKeyDown);
        contextMenus = contextMenus.filter(cm => cm !== this);
    },

    methods: {
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

            window.dispatchEvent(new Event("contextmenuopen"));
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
