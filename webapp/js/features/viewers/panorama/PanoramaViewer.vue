<template>
    <ViewerShell id="panorama" v-model:error="error" dark :loading="loading" :load-error="loadError" loading-text="Loading viewer...">
        <div ref="container" class="viewer" />
    </ViewerShell>
</template>

<script setup>
/**
 * PanoramaViewer - a 360° photo in Photo Sphere Viewer, posed from the entry's XMP
 * properties (on ViewerShell and useViewerEntry; the viewer is destroyed on leave).
 * The viewer starts while the loading row is still above it and Photo Sphere Viewer only
 * follows the window's size: it is resized with its container, so it fills the room the
 * loading row leaves.
 */
import { ref, onMounted, onBeforeUnmount } from 'vue';
import ddb from 'ddb';
import ViewerShell from '@/components/ViewerShell.vue';
import { useViewerEntry } from '@/composables/useViewerEntry';
import { loadResources } from '@/libs/lazy';
import { colorToken } from '@/libs/colorScheme';
import { useResizeObserver } from '@/composables/useEventListener';

defineOptions({ name: 'PanoramaViewer' });

const { entry, dataset, loading, error, loadError, entryLoaded } = useViewerEntry({
    types: [ddb.entry.type.PANORAMA, ddb.entry.type.GEOPANORAMA], typeLabel: 'a panorama', title: 'Panorama'
});
const container = ref(null);
let viewer = null;
let left = false;

onMounted(async () => {
    useResizeObserver(container.value, () => viewer?.autoSize());
    if (!await entryLoaded) return;
    loading.value = true;
    try {
        await loadResources('/potree/libs/three.js/build/three.min.js');
        await loadResources('/photosphereviewer/browser.min.js');
        await loadResources('/photosphereviewer/photo-sphere-viewer.min.css');
        await loadResources('/photosphereviewer/photo-sphere-viewer.min.js');
        if (left) return;
        const p = entry.value.properties || {};
        // The size of the whole sphere of a cropped panorama (GPano FullPanoWidthPixels/HeightPixels). The size of
        // the image is the cropped part, not the sphere: it is never given as the full size (FR-VWR-19). Without
        // it in the entry the viewer reads the GPano XMP of the file (it is the original), and failing that it has
        // the image size, which is right for a complete panorama.
        const hasFullSize = [p.fullWidth, p.fullHeight].every(v => typeof v === 'number' && v > 0);
        viewer = new PhotoSphereViewer.Viewer({
            container: container.value,
            panorama: dataset.value.downloadUrl(entry.value.path, { inline: true }),
            loadingTxt: 'Loading ...',
            useXmpData: !hasFullSize,
            // The viewers are dark in both themes: the token has one value
            canvasBackground: colorToken('--ddb-viewer-canvas-bg'),
            minFov: 1,
            defaultZoomLvl: 60,
            panoData: {
                fullWidth: hasFullSize ? p.fullWidth : undefined,
                fullHeight: hasFullSize ? p.fullHeight : undefined,
                croppedWidth: p.croppedWidth,
                croppedHeight: p.croppedHeight,
                croppedX: p.croppedX,
                croppedY: p.croppedY,
                poseHeading: p.poseHeading,
                posePitch: p.posePitch,
                poseRoll: p.poseRoll
            }
        });
    } catch (e) {
        error.value = e.message;
    } finally {
        loading.value = false;
    }
});

onBeforeUnmount(() => {
    left = true;
    if (viewer) viewer.destroy();
    viewer = null;
});
</script>

<style scoped>
.viewer {
    position: relative;
    display: flex;
    width: 100%;
    height: 100%;
}

.viewer :deep(.psv-loader) {
    color: var(--ddb-text-on-dark);
}

.viewer :deep(.psv-container) {
    background: var(--ddb-viewer-bg);
}

.viewer :deep(.psv-download-button) {
    display: none;
}
</style>
