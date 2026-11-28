<template>
    <section :aria-labelledby="`${uid}-capture`" class="annotation-capture" data-testid="annotation-capture">
        <h2 :id="`${uid}-capture`" class="capture-heading">3D view for reports</h2>
        <template v-if="imageUrl">
            <img v-if="!failed" class="capture-image" :src="imageUrl" :alt="alt" data-testid="capture-image" @error="failed = true">
            <p v-else class="capture-note" role="alert">The picture is not in the dataset. Capture the view again.</p>
            <p v-if="capturedText" class="capture-note">Captured {{ capturedText }}</p>
        </template>
        <p v-else class="capture-note" data-testid="capture-none">
            No picture yet. {{ canCapture ? 'Capture for report frames the item and keeps the 3D view as its picture.' : '' }}
        </p>
    </section>
</template>

<script setup>
/**
 * The picture of the 3D view a 3D item keeps for reports (its `snapshot`: the image the point cloud viewer wrote for
 * it), shown in its Photos tab: the image as the report shows it, and when it was captured. Without one it says so,
 * and how to make one when the user can (`canCapture`).
 */
import { computed, ref, useId, watch } from 'vue';
import { capture3dImageUrl } from '@/libs/reports/snapshots/capture3d';
import { formatDateTime } from '@/libs/format';

const props = defineProps({
    /** The dataset API client (the address of the image) */
    dataset: { type: Object, required: true },
    /** The item's capture: { path, camera, capturedAt }, or null */
    snapshot: { type: Object, default: null },
    /** The item's name, for the alternative text */
    itemName: { type: String, default: '' },
    /** The dialog has the Capture for report button */
    canCapture: { type: Boolean, default: false }
});

const uid = useId();
const failed = ref(false);
const imageUrl = computed(() => capture3dImageUrl(props.snapshot, props.dataset));
watch(imageUrl, () => { failed.value = false; });
const capturedText = computed(() => formatDateTime(props.snapshot?.capturedAt));
const alt = computed(() => (props.itemName.trim() ? `3D view of ${props.itemName.trim()}` : '3D view of the item'));
</script>

<style scoped>
.annotation-capture {
    margin-bottom: var(--ddb-spacing-md);
}

.capture-heading {
    margin: 0 0 var(--ddb-spacing-sm);
    font-size: 1rem;
    font-weight: 600;
}

.capture-image {
    display: block;
    max-width: 100%;
    max-height: 14rem;
    border-radius: var(--ddb-radius-sm);
    background: var(--ddb-bg-subtle);
}

.capture-note {
    margin: var(--ddb-spacing-xs) 0;
    color: var(--ddb-text-secondary);
}
</style>
