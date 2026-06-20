<template>
    <Dialog :visible="true" :header="title" :modal="modal" :closable="closable"
        :draggable="!fixedPosition" :style="dialogStyle" :contentStyle="contentStyle"
        :dismissableMask="closeModalOnClick" :closeOnEscape="closable"
        :pt="dialogPt" @update:visible="handleClose" @show="handleShow">
        <div ref="contentRoot" style="display: contents;">
            <slot />
        </div>
    </Dialog>
</template>

<script>
import Dialog from 'primevue/dialog';

/**
 * Window - Draggable modal/dialog wrapper around PrimeVue Dialog.
 *
 * Provides a consistent look for all modal/non-modal windows in the app.
 * Supports fixed size, max-width, click-outside dismiss, and Escape close.
 *
 * Props:
 *   title             - Dialog header text.
 *   fixedSize         - Disables auto-size (content overflows with scroll) (default: false).
 *   maxWidth          - CSS max-width of the dialog (default: '90%').
 *   fixedPosition     - Disables dragging (default: false).
 *   modal             - Whether to show the backdrop (default: false).
 *   closeModalOnClick - Dismiss when clicking outside (default: false).
 *   closable          - Show the X close button (default: true).
 */
export default {
    components: {
        Dialog
    },
    emits: ['onClose', 'show'],
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
        sizeClass: {
            type: String,
            default: null
        },
        autofocus: {
            type: Boolean,
            default: true
        },
    },
    computed: {
        dialogStyle() {
            const style = {};
            if (this.sizeClass) {
                // Size managed by CSS class - no inline dimensions
                style.width = 'auto';
                return style;
            }
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
            const rootClasses = ['window-dialog'];
            if (this.sizeClass) {
                rootClasses.push(this.sizeClass);
            }
            return {
                root: {
                    class: rootClasses.join(' ')
                },
                content: {
                    // class: 'text-selectable'
                }
            };
        }
    },
    methods: {
        handleClose(visible) {
            if (!visible) {
                this.$emit("onClose");
            }
        },
        handleShow() {
            this.$emit('show');
            if (!this.autofocus) return;
            // PrimeVue's Dialog focuses the element carrying the `autofocus`
            // attribute once the enter transition completes (onAfterEnter), and its
            // FocusTrap does the same on bind; without such an element it falls back
            // to the close button. This @show hook fires at the START of the
            // transition, so focusing here would just get overridden. Instead we tag
            // the primary field with `autofocus` and let the framework focus it at the
            // right time. An element can opt in explicitly via `data-autofocus`;
            // otherwise the first enabled text input / textarea / select is used.
            // Opt out per-dialog with :autofocus="false".
            const root = this.$refs.contentRoot;
            if (!root || typeof root.querySelector !== 'function') return;
            const fieldSelector = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=reset]):not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly]), select:not([disabled])';
            const explicit = root.querySelector('[data-autofocus]');
            let target;
            if (explicit) {
                target = (explicit.matches && explicit.matches(fieldSelector))
                    ? explicit
                    : (explicit.querySelector(fieldSelector) || explicit);
            } else {
                target = root.querySelector(fieldSelector);
            }
            if (!target) return;
            if (target.setAttribute) target.setAttribute('autofocus', '');
            // Focus immediately too (preventScroll avoids a mid-animation jump); the
            // attribute keeps PrimeVue's post-transition focus on the same element.
            if (typeof target.focus === 'function') target.focus({ preventScroll: true });
        }
    }
}
</script>

<style>

</style>