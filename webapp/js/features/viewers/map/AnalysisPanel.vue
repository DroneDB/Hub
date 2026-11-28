<template>
    <div ref="root" class="analysis-panel" :class="[`analysis-panel--${variant}`, { 'is-minimised': minimised, 'has-actions': !!$slots.actions }]"
         :style="reserves">
        <!-- The header and the tool bar: the part of the panel that stays in view while the body scrolls -->
        <div ref="topBlock" class="panel-top">
            <div class="panel-header">
                <span class="panel-heading">
                    <span class="panel-title"><i :class="icon" /> {{ title }}</span>
                    <span v-if="subtitle || $slots.subtitle" class="panel-subtitle"><slot name="subtitle">{{ subtitle }}</slot></span>
                </span>
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
            <div v-if="$slots.tools" class="panel-tools" role="toolbar" :aria-label="`${title} tools`">
                <slot name="tools" />
            </div>
        </div>
        <slot />
        <!-- The actions of the panel: the foot of the panel, in view whatever the length of what is above it -->
        <div v-if="$slots.actions" ref="actionsBlock" class="panel-actions" :class="{ 'has-more': hasMore }" data-testid="panel-actions">
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
 * The `tools` slot is the tool bar, under the header: the buttons that put the map in a mode or start
 * a map action. It shares a sticky block with the header (`.panel-top`), so both stay in view while the
 * body scrolls. `subtitle` is a second, muted line under the title (a prop, or the `subtitle` slot when
 * the line needs an attribute of its own).
 *
 * The `actions` slot is the foot of the panel: a sticky footer that stays in view while
 * the body above it scrolls, with a fade over the bottom of the body while more of it is hidden
 * under the footer. The three panels put their buttons there; none has footer CSS of its own.
 *
 * The two sticky blocks have the height their content makes (a tool bar of two rows on a narrow panel,
 * a footer that wraps while its menu is open), so their heights are measured and published as
 * `--panel-top-reserve` and `--panel-actions-reserve` on the root: the stylesheet keeps the field the
 * keyboard focuses, and what scrollIntoView aims at, clear of them whatever they measure.
 */
import { computed, nextTick, onMounted, onUpdated, ref, watch } from 'vue';
import { useEventListener, useResizeObserver } from '@/composables/useEventListener';

defineProps({
    /** Classes of the icon in front of the title */
    icon: { type: String, required: true },
    title: { type: String, required: true },
    /** A second, smaller line under the title */
    subtitle: { type: String, default: '' },
    /** The accent of the panel: the colours are those of .analysis-panel--{variant} */
    variant: { type: String, required: true, validator: v => ['stockpile', 'raster', 'plant-health'].includes(v) }
});
defineEmits(['close']);

const minimised = ref(false);
const toggleLabel = computed(() => (minimised.value ? 'Expand' : 'Minimise'));

const root = ref(null);
const topBlock = ref(null);
const actionsBlock = ref(null);
// More of the body is scrolled out of sight below the footer
const hasMore = ref(false);
// The heights of the sticky blocks, 0 for a block the panel does not have (or that the folded sheet hides)
const topReserve = ref(0);
const actionsReserve = ref(0);
const reserves = computed(() => ({
    '--panel-top-reserve': `${topReserve.value}px`,
    '--panel-actions-reserve': `${actionsReserve.value}px`
}));

// Rounded up: a fraction of a pixel short would leave the edge of a focused field under the block
const heightOf = el => (el ? Math.ceil(el.getBoundingClientRect().height) : 0);

function measure() {
    const el = root.value;
    hasMore.value = !!el && el.scrollHeight - el.clientHeight - el.scrollTop > 1;
    topReserve.value = heightOf(topBlock.value);
    actionsReserve.value = heightOf(actionsBlock.value);
}

onMounted(() => {
    useEventListener(root.value, 'scroll', measure, { passive: true });
    // The root changes size with its content, the blocks also change without it (the panel is capped in height: a tool bar
    // that wraps or a footer that grows does not resize it)
    const observer = useResizeObserver(root.value, measure);
    observer?.observe(topBlock.value);
    if (actionsBlock.value) observer?.observe(actionsBlock.value);
    // The footer comes and goes with its slot
    watch(actionsBlock, (el, previous) => {
        if (previous) observer?.unobserve(previous);
        if (el) observer?.observe(el);
    }, { flush: 'post' });
    measure();
});
// What the panel holds changed (a result, a profile, a message): it may now overflow
onUpdated(() => nextTick(measure));
</script>
