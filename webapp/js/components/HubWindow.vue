<template>
    <Dialog :visible="visible" :header="title" :modal="modal" :closable="closable && !busy"
            :draggable="!fixedPosition" :style="dialogStyle" :content-style="contentStyle"
            :dismissable-mask="closeModalOnClick && !busy" :close-on-escape="false"
            :pt="dialogPt" @update:visible="v => { if (!v) close(); }" @show="onShow">
        <div ref="contentRoot" style="display: contents;">
            <slot />
            <div v-if="$slots.footer || confirmLabel || closeButton" class="window-footer d-flex justify-content-end gap-2 mt-3 w-100">
                <slot name="footer">
                    <Button :label="cancelLabel" severity="secondary" :disabled="busy" data-cancel @click="close()" />
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
 *   something else; never with `enterConfirms` false or `confirmDisabled`).
 * - `busy` disables closing and the footer buttons.
 * - A footer: the `footer` slot; Cancel and `confirmLabel` buttons when confirmLabel is set;
 *   just the Cancel (`cancelLabel`) button with `closeButton`. A footer of its own marks its
 *   buttons [data-cancel] and [data-confirm].
 * - The overlay stack (composables/useOverlay) owns the rest: only the topmost open overlay
 *   reacts to the keyboard, and Escape with an open Select in it only closes the Select; when
 *   shown, the focus goes to the [data-autofocus] element, for a destructive confirmation
 *   (`danger`, or confirmSeverity 'danger') the [data-cancel] button, else the first visible
 *   field, then the confirm button; so the keyboard never stays on the page behind the dialog,
 *   and Enter never confirms a destructive action by default; on close it goes back to the
 *   control that opened the window.
 *
 *   <Window id="rename" title="Rename" modal confirm-label="Rename" :busy="saving" @confirm="rename" @close="cancel">
 */
import { ref, computed, useId } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import { useEventListener } from '@/composables/useEventListener';
import { useOverlay } from '@/composables/useOverlay';

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
    /** Enter from a field confirms (a form); false for a question Enter must not answer */
    enterConfirms: { type: Boolean, default: true },
    /** A destructive confirmation: the focus starts on the [data-cancel] button */
    danger: { type: Boolean, default: false },
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

// ---- Keyboard and focus: the overlay stack ------------------------------------------------

// The dialog element (PrimeVue renders it, with role="dialog", around the content)
const dialogElement = () => contentRoot.value?.closest('[role="dialog"]') || contentRoot.value;

const overlay = useOverlay({
    active: () => props.visible,
    container: dialogElement,
    focusRoot: () => contentRoot.value,
    danger: () => props.danger || props.confirmSeverity === 'danger',
    modal: () => props.modal,
    onEscape: e => {
        if (!props.closable) return;
        e.preventDefault();
        close();
    }
});

const NOT_FOR_ENTER = 'button, a, textarea, select, [role="button"], [role="menuitem"], [role="option"], [contenteditable="true"], [aria-expanded="true"]';

// Something inside the dialog that handled Enter (a dropdown choosing an option) keeps it
const handledInside = e => e.defaultPrevented && !!dialogElement()?.contains(e.target);

useEventListener(document, 'keydown', e => {
    if (e.key !== 'Enter' || !props.visible || !overlay.isTopmost() || handledInside(e) || e.isComposing) return;
    if (props.enterConfirms && !props.busy && !props.confirmDisabled && !(e.target instanceof Element && e.target.closest(NOT_FOR_ENTER))) {
        emit('confirm');
    }
});

// ---- Look -------------------------------------------------------------------------------

// The size reaches the stylesheet as custom properties (--window-width, --window-height,
// --window-max-width), which is what lets app.scss clamp every window to the screen and
// give phones their own sizes with a media query, not by overriding inline styles.
const dialogStyle = computed(() => {
    if (props.sizeClass) return {};
    const style = props.fixedSize ? {} : { '--window-width': props.width, '--window-height': props.height };
    if (props.maxWidth && props.maxWidth !== 'auto') style['--window-max-width'] = props.maxWidth;
    return style;
});
const contentStyle = computed(() => (props.fixedSize ? {} : { overflow: 'auto', flex: '1' }));

// A window asked to fill most of the screen (a document, an editor) keeps the whole phone
// screen; the others shrink to their content there
const TALL_FROM_PERCENT = 60;
const isTall = computed(() => !props.sizeClass && !props.fixedSize && /^\d+(\.\d+)?%$/.test(props.height) && parseFloat(props.height) >= TALL_FROM_PERCENT);
const dialogPt = computed(() => ({
    root: { id: props.id || generatedId, class: ['window-dialog', props.sizeClass, isTall.value && 'window-tall'].filter(Boolean).join(' ') }
}));

// PrimeVue's Dialog keeps the element focused when it shows (the opener) and focuses it again
// when it hides, then focuses the [autofocus] element after its enter transition. The target
// is focused after the Dialog has kept the opener (not an element inside, which an
// InputNumber's handlers no longer have once it unmounts), without scrolling mid-animation,
// and tagged [autofocus] for the end of the transition.
function onShow() {
    emit('show');
    if (!props.focusOnShow) return;
    queueMicrotask(() => {
        const target = overlay.focusInitial();
        if (target && contentRoot.value?.contains(target)) target.setAttribute('autofocus', '');
    });
}
</script>

