<template>
    <OverlayToolbar class="potree-display-bar" label="Display" data-testid="potree-display-bar">
        <!-- On a phone (below sm) the four views are one choice, so the bar keeps to a line over the cloud -->
        <span v-if="compact" class="tool-choice">
            <select class="tool-select" data-testid="view-select" aria-label="Look at the point cloud from" value="" @change="pickView">
                <option value="" disabled>View</option>
                <option v-for="view in VIEWS" :key="view.key" :value="view.key">{{ view.label }}</option>
            </select>
        </span>
        <template v-else>
            <button v-for="view in VIEWS" :key="view.key" type="button" :data-testid="`view-${view.key}`" :title="view.title" :aria-label="`${view.label} view`"
                    @click="setView(viewer, view.key)">
                <span class="tool-label">{{ view.label }}</span>
            </button>
        </template>
        <div class="tool-group">
            <span class="tool-choice">
                <label v-if="!compact" for="potree-color-by" class="tool-label">Colour by</label>
                <select id="potree-color-by" v-model="colorBy" class="tool-select" data-testid="color-by" aria-label="Colour the points by"
                        @focus="refreshOptions" @pointerdown="refreshOptions">
                    <option v-for="option in options" :key="option.name" :value="option.name">{{ option.label }}</option>
                </select>
            </span>
            <span class="tool-choice" :title="unitsLockedReason || 'The unit of the measurements'">
                <select id="potree-unit-select" v-model="unit" class="tool-select" data-testid="unit-select" aria-label="Units" :disabled="!!unitsLockedReason">
                    <option v-for="option in UNITS" :key="option.value" :value="option.value">{{ option.label }}</option>
                </select>
            </span>
        </div>
    </OverlayToolbar>
</template>

<script setup>
/**
 * How a point cloud is shown, in a bar of its own at the bottom left of the viewer, apart from the tools the user
 * works with (the measuring toolbar, top left): the top/front/side views, the colour of the points and the unit of the
 * measurements. The views and the colour do what the icons of the Potree menu do; the menu keeps the advanced settings
 * and follows what is done here (libs/potree/potreeTools). The colours offered follow the ranges that the loading of
 * the cloud fills. The unit is the viewer's (a preference of the user): the bar shows and changes it, and shows it
 * locked, with the reason, on a cloud whose lengths cannot be converted. Below sm (useStackedLayout) the views are one
 * choice and the colour has no name before it.
 */
import { ref, shallowRef, computed, watch, onBeforeUnmount } from 'vue';
import OverlayToolbar from '@/components/OverlayToolbar.vue';
import { VIEWS, setView, colorOptions, rangeSignature, setColorBy } from '@/libs/potree/potreeTools';
import { useStackedLayout } from '@/composables/useStackedLayout';

// The units of the measurements: the value of the preference and what the choice says
const UNITS = Object.freeze([
    { value: 'metric', label: 'Metric (m)' },
    { value: 'imperial', label: 'Imperial (ft)' }
]);

const props = defineProps({
    /** The Potree viewer, with its point cloud loaded */
    viewer: { type: Object, required: true },
    /** Why the unit cannot be chosen on this cloud; empty when it can */
    unitsLockedReason: { type: String, default: '' }
});
/** The unit of the measurements: 'metric' | 'imperial' */
const unit = defineModel('unit', { type: String, required: true });

const compact = useStackedLayout();
const pointcloud = props.viewer.scene.pointclouds?.[0];

const colorBy = ref(pointcloud?.material?.activeAttributeName ?? 'rgba');
// The ranges of the attributes are not reactive: they grow as nodes load, and the options are made again when they do
const signature = shallowRef(rangeSignature(pointcloud));
const refreshOptions = () => {
    const next = rangeSignature(pointcloud);
    if (next !== signature.value) signature.value = next;
};
const options = computed(() => {
    void signature.value;
    const offered = colorOptions(pointcloud, colorBy.value);
    // A colouring set from the menu that the bar has no name for stays shown
    return offered.some(o => o.name === colorBy.value) ? offered : [...offered, { name: colorBy.value, label: colorBy.value }];
});
watch(colorBy, name => { if (name !== pointcloud?.material?.activeAttributeName) setColorBy(pointcloud, name); });
// The menu changes it too
const onColorChanged = () => { colorBy.value = pointcloud.material.activeAttributeName; };
pointcloud?.material?.addEventListener('active_attribute_changed', onColorChanged);
// Potree 1.8 has no event for a loaded node: each frame compares the ranges (a few numbers)
props.viewer.addEventListener?.('update', refreshOptions);

onBeforeUnmount(() => {
    props.viewer.removeEventListener?.('update', refreshOptions);
    pointcloud?.material?.removeEventListener('active_attribute_changed', onColorChanged);
});

/** @param {Event} e */
function pickView(e) {
    const select = /** @type {HTMLSelectElement} */ (e.target);
    setView(props.viewer, select.value);
    // The choice says "View" again: the same view can be picked twice
    select.value = '';
}
</script>
