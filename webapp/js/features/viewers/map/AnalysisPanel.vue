<template>
    <div ref="root" class="analysis-panel" :class="[`analysis-panel--${variant}`, { 'is-minimised': minimised }]">
        <div class="panel-header">
            <span class="panel-title"><i :class="icon" /> {{ title }}</span>
            <span class="panel-header-actions">
                <button class="sheet-toggle" type="button" :title="toggleLabel" :aria-label="toggleLabel"
                        :aria-expanded="String(!minimised)" @click="minimised = !minimised">
                    <i :class="minimised ? 'fas fa-chevron-up' : 'fas fa-chevron-down'" />
                </button>
                <button class="close-btn" type="button" title="Close" aria-label="Close" @click="$emit('close')">
                    <i class="fas fa-times" />
                </button>
            </span>
        </div>
        <slot />
        <!-- The actions of the panel: the foot of the panel, in view whatever the length of what is above it -->
        <div v-if="$slots.actions" class="panel-actions" :class="{ 'has-more': hasMore }" data-testid="panel-actions">
            <slot name="actions" />
        </div>
    </div>
</template>

<script setup>
/**
 * The shell the map's analysis panels share: the card with its title and close button, and on a
 * phone, where the panel is a sheet over the bottom of the map, a button that folds it to its
 * header so the layers underneath can be reached. The fold is only CSS (css/_analysis-panel.scss
 * hides the content), so what the panel holds (a form, a detection in progress, a selected pile)
 * is still there when it is unfolded. The panels mount it with v-if, so it opens unfolded every time.
 *
 * The `actions` slot is the foot of the panel (FR-RAS-23): a sticky footer that stays in view while
 * the body above it scrolls, with a fade over the bottom of the body while more of it is hidden
 * under the footer. The three panels put their buttons there; none has footer CSS of its own.
 */
import { computed, nextTick, onMounted, onUpdated, ref } from 'vue';
import { useEventListener, useResizeObserver } from '@/composables/useEventListener';

defineProps({
    /** Classes of the icon in front of the title */
    icon: { type: String, required: true },
    title: { type: String, required: true },
    /** The accent of the panel: the colours are those of .analysis-panel--{variant} */
    variant: { type: String, required: true, validator: v => ['stockpile', 'raster', 'plant-health'].includes(v) }
});
defineEmits(['close']);

const minimised = ref(false);
const toggleLabel = computed(() => (minimised.value ? 'Expand' : 'Minimise'));

const root = ref(null);
// More of the body is scrolled out of sight below the footer
const hasMore = ref(false);

function measure() {
    const el = root.value;
    hasMore.value = !!el && el.scrollHeight - el.clientHeight - el.scrollTop > 1;
}

onMounted(() => {
    useEventListener(root.value, 'scroll', measure, { passive: true });
    useResizeObserver(root.value, measure);
    measure();
});
// What the panel holds changed (a result, a profile, a message): it may now overflow
onUpdated(() => nextTick(measure));
</script>
