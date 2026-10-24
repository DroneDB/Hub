<template>
    <Dialog :visible="visible" :header="title" :modal="modal" :closable="closable && !busy"
            :draggable="!fixedPosition" :style="dialogStyle" :content-style="contentStyle"
            :dismissable-mask="closeModalOnClick && !busy" :close-on-escape="false"
            :pt="dialogPt" @update:visible="v => { if (!v) close(); }" @show="onShow">
        <div ref="contentRoot" style="display: contents;">
            <slot />
            <div v-if="$slots.footer || confirmLabel || closeButton" class="window-footer d-flex justify-content-end gap-2 mt-3 w-100">
                <slot name="footer">
                    <Button :label="cancelLabel" severity="secondary" :disabled="busy" @click="close()" />
                    <Button v-if="confirmLabel" :label="confirmLabel" :severity="confirmSeverity" :icon="confirmIcon" data-confirm
                            :disabled="busy || confirmDisabled" :loading="busy" @click="emit('confirm')" />
                </slot>
            </div>
        </div>
    </Dialog>
</template>

<script setup>
/**
 * Window - the one dialog component: PrimeVue Dialog plus the behaviour every
 * dialog needs.
 *
 * - `close` (with an optional result) on the X, a mask click (closeModalOnClick) or Escape;
 *   `update:visible` too, so `v-model:visible` works. Rendered with v-if, visible stays true.
 * - `confirm` on Enter (not from a button, a link, a text area or a menu, where Enter means
 *   something else). Only the topmost open Window reacts to the keyboard.
 * - `busy` disables closing and the footer buttons.
 * - A footer: the `footer` slot; Cancel and `confirmLabel` buttons when confirmLabel is set;
 *   just the Cancel (`cancelLabel`) button with `closeButton`.
 * - Focuses the [data-autofocus] element, the first field, or the confirm button when shown,
 *   so the keyboard never stays on the page behind the dialog.
 *
 *   <Window id="rename" title="Rename" modal confirm-label="Rename" :busy="saving" @confirm="rename" @close="cancel">
 */
import { ref, computed, watch, onBeforeUnmount, useId } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import { useEventListener } from '@/composables/useEventListener';

defineOptions({ name: 'HubWindow' });

const props = defineProps({
    /** DOM id of the dialog (generated when omitted) */
    id: { type: String, default: '' },
    title: { type: String, default: '' },
    visible: { type: Boolean, default: true },
    modal: { type: Boolean, default: false },
    closable: { type: Boolean, default: true },
    closeModalOnClick: { type: Boolean, default: false },
    fixedPosition: { type: Boolean, default: false },
    /** Auto-sized (content scrolls) instead of width x height */
    fixedSize: { type: Boolean, default: false },
    maxWidth: { type: String, default: 'auto' },
    width: { type: String, default: '30%' },
    height: { type: String, default: '40%' },
    /** CSS size class (dialog-xs ... dialog-xl): no inline size */
    sizeClass: { type: String, default: null },
    /** Focus the first field (or [data-autofocus]) when shown */
    focusOnShow: { type: Boolean, default: true },
    busy: { type: Boolean, default: false },
    confirmLabel: { type: String, default: '' },
    cancelLabel: { type: String, default: 'Cancel' },
    confirmSeverity: { type: String, default: 'primary' },
    confirmIcon: { type: String, default: undefined },
    confirmDisabled: { type: Boolean, default: false },
    /** A footer with only the Cancel button (labelled cancelLabel) */
    closeButton: { type: Boolean, default: false }
});
const emit = defineEmits(['update:visible', 'close', 'confirm', 'show']);
const contentRoot = ref(null);
const generatedId = useId();

function close(result) {
    if (props.busy) return;
    emit('update:visible', false);
    emit('close', result);
}

// ---- Keyboard: the topmost visible Window only -------------------------------------------

const token = {};
watch(() => props.visible, visible => {
    openWindows.delete(token);
    if (visible) openWindows.add(token);
}, { immediate: true });
onBeforeUnmount(() => openWindows.delete(token));

const NOT_FOR_ENTER = 'button, a, textarea, select, [role="button"], [role="menuitem"], [role="option"], [contenteditable="true"]';

// Something inside the dialog that handled the key (a dropdown closing) keeps it; a key
// handled elsewhere (focus left in a closed context menu) does not
const handledInside = e => e.defaultPrevented && !!contentRoot.value && !!contentRoot.value.closest('.p-dialog')?.contains(e.target);

useEventListener(document, 'keydown', e => {
    if (!props.visible || [...openWindows].pop() !== token || handledInside(e) || e.isComposing) return;
    if (e.key === 'Escape' && props.closable) {
        e.preventDefault();
        close();
    } else if (e.key === 'Enter' && !props.busy && !props.confirmDisabled && !(e.target instanceof Element && e.target.closest(NOT_FOR_ENTER))) {
        emit('confirm');
    }
});

// ---- Look -------------------------------------------------------------------------------

const dialogStyle = computed(() => {
    if (props.sizeClass) return { width: 'auto' };
    const style = props.fixedSize ? { width: 'auto' } : { width: props.width, height: props.height };
    if (props.maxWidth && props.maxWidth !== 'auto') style.maxWidth = props.maxWidth;
    return style;
});
const contentStyle = computed(() => (props.fixedSize ? {} : { overflow: 'auto', flex: '1' }));
const dialogPt = computed(() => ({
    root: { id: props.id || generatedId, class: ['window-dialog', props.sizeClass].filter(Boolean).join(' ') }
}));

const FIELD = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=reset]):not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly]), select:not([disabled])';

const FOCUSABLE = 'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

// PrimeVue focuses the [autofocus] element after its enter transition: tag the target
// ([data-autofocus], else the first field, the confirm button, anything focusable) and
// focus it now too, without scrolling mid-animation
function focusTarget(root) {
    const explicit = root.querySelector('[data-autofocus]');
    if (explicit) return explicit.matches(FIELD) ? explicit : explicit.querySelector(FIELD) || explicit;
    return root.querySelector(FIELD) || root.querySelector('[data-confirm]:not([disabled])') || root.querySelector(FOCUSABLE);
}

function onShow() {
    emit('show');
    const root = contentRoot.value;
    if (!props.focusOnShow || !root) return;
    const target = focusTarget(root);
    if (!target) return;
    target.setAttribute('autofocus', '');
    target.focus({ preventScroll: true });
}
</script>

<script>
// Visible Windows in opening order (the last one has the keyboard)
const openWindows = new Set();
</script>
