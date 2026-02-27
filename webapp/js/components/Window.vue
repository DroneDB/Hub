<template>
    <Dialog :visible="true" :header="title" :modal="modal" :closable="closable"
        :draggable="!fixedPosition" :style="dialogStyle" :contentStyle="contentStyle"
        :dismissableMask="closeModalOnClick" :closeOnEscape="closable"
        :pt="dialogPt" @update:visible="handleClose">
        <slot />
    </Dialog>
</template>

<script>
import Dialog from 'primevue/dialog';

export default {
    components: {
        Dialog
    },
    props: {
        title: {
            type: String,
            default: ""
        },
        fixedSize: {
            type: Boolean,
            default: false
        },
        maxWidth: {
            type: String,
            default: "auto"
        },
        width: {
            type: String,
            default: "30%"
        },
        height: {
            type: String,
            default: "40%"
        },
        id: {
            type: String,
            required: true
        },
        modal: {
            type: Boolean,
            default: false
        },
        fixedPosition: {
            type: Boolean,
            default: false
        },
        closeModalOnClick: {
            type: Boolean,
            default: false
        },
        closable: {
            type: Boolean,
            default: true
        },
    },
    computed: {
        dialogStyle() {
            const style = {};
            if (this.fixedSize) {
                // Auto-sized dialog: use maxWidth for constraint
                style.width = 'auto';
                if (this.maxWidth && this.maxWidth !== 'auto') {
                    style.maxWidth = this.maxWidth;
                }
            } else {
                // Explicitly sized dialog
                style.width = this.width;
                style.height = this.height;
                if (this.maxWidth && this.maxWidth !== 'auto') {
                    style.maxWidth = this.maxWidth;
                }
            }
            return style;
        },
        contentStyle() {
            if (!this.fixedSize) {
                return { overflow: 'auto', flex: '1' };
            }
            return {};
        },
        dialogPt() {
            return {
                root: {
                    class: 'window-dialog'
                },
                content: {
                    class: 'text-selectable'
                }
            };
        }
    },
    methods: {
        handleClose(visible) {
            if (!visible) {
                this.$emit("onClose");
            }
        }
    }
}
</script>

<style>
/* Global styles for Window/Dialog bridge */
.window-dialog .p-dialog-content {
    padding: 0.75rem 1rem;
}
</style>