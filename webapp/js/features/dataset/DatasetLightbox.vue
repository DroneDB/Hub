<template>
    <component :is="FsLightbox" v-if="FsLightbox && sources.length" :key="key" :toggler="toggler" :slide="slide" :sources="sources"
               :on-open="onOpen" :on-close="() => { isOpen = false; }" :on-show="track" type="image" :load-only-current-source="true" />
    <div v-if="isOpen" class="lightbox-toolbar-extra">
        <button class="lightbox-open-fullsize" title="Open in new tab" aria-label="Open in new tab" @click="openCurrent">
            <i class="fa-solid fa-up-right-from-square" />
        </button>
    </div>
    <div v-if="isOpen && current" class="lightbox-info-overlay">
        <div class="lightbox-info-name">{{ current.name }}</div>
        <div v-if="current.coords" class="lightbox-info-coords">
            <i class="fa-solid fa-location-dot me-1" />{{ current.coords }}
        </div>
        <div v-if="current.altitude !== null" class="lightbox-info-altitude">
            <i class="fa-solid fa-arrows-up-down me-1" />{{ current.altitude }} m
        </div>
    </div>
    <VideoLightbox v-if="video" visible :src="video.src" :entry="video.entry" @close="video = null" />
</template>

<script setup>
/**
 * The dataset page's photo and video lightboxes: the
 * photos of the folder on show, with the current one's name, position and altitude, or one
 * video.
 *
 *   lightbox.value.open(node, files)   // a photo: every photo of `files`; a video: just it
 */
import { ref, shallowRef, markRaw, computed, nextTick } from 'vue';
import { pointLonLat } from '@/libs/ddb/pointGeom';
import ddb from 'ddb';
import { lazyComponent } from '@/libs/lazyComponent';

// Loaded on the first photo: it opens when its toggler changes, so it must be mounted first
const FsLightbox = shallowRef(null);
const VideoLightbox = lazyComponent(() => import(/* webpackChunkName: "dataset-lightbox" */ './VideoLightbox.vue'), { showLoader: false });

const props = defineProps({
    dataset: { type: Object, required: true }
});

const T = ddb.entry.type;
const isPhoto = entry => entry.type === T.IMAGE || entry.type === T.GEOIMAGE;
const isVideo = entry => entry.type === T.VIDEO || entry.type === T.GEOVIDEO;
const pathOf = item => ddb.utils.datasetPathFromUri(item.path)[1];

const sources = ref([]);
const entries = ref([]);
const slide = ref(1);
const currentSlide = ref(1);
const toggler = ref(false);
const key = ref(0);
const isOpen = ref(false);
const video = ref(null);

const current = computed(() => {
    const item = entries.value[currentSlide.value - 1];
    if (!item) return null;
    let coords = null;
    let altitude = null;
    const c = pointLonLat(item.entry.point_geom);
    if (c) {
        coords = `${c[1].toFixed(6)}, ${c[0].toFixed(6)}`;
        if (c.length >= 3 && c[2] !== 0) altitude = c[2].toFixed(1);
    }
    return { name: ddb.pathutils.basename(item.path), coords, altitude };
});

/** Whether the lightbox shows this kind of entry. */
function supports(entry) {
    return isPhoto(entry) || isVideo(entry);
}

/** Shows a photo among the photos of `files`, or a video. */
async function open(node, files) {
    if (isVideo(node.entry)) {
        const path = pathOf(node);
        video.value = { src: props.dataset.downloadUrl(path, { inline: true }), entry: { ...node.entry, path } };
        return;
    }
    const photos = files.filter(f => isPhoto(f.entry));
    if (!photos.length) return;
    if (!FsLightbox.value) FsLightbox.value = markRaw((await import(/* webpackChunkName: "dataset-lightbox" */ 'fslightbox-vue')).default);
    const paths = photos.map(pathOf);
    sources.value = paths.map(p => props.dataset.thumbUrl(p, 1024));
    entries.value = photos.map((f, i) => ({ path: paths[i], entry: f.entry }));
    slide.value = currentSlide.value = Math.max(paths.indexOf(pathOf(node)), 0) + 1;
    // A new FsLightbox for the new sources, then toggle it open
    key.value++;
    await nextTick();
    await nextTick();
    toggler.value = !toggler.value;
}

function track(instance) {
    if (instance && instance.stageIndexes) currentSlide.value = instance.stageIndexes.current + 1;
}

// FsLightbox reports no slide change: follow its slide-number setter
function onOpen(instance) {
    isOpen.value = true;
    track(instance);
    if (instance && typeof instance.sn === 'function') {
        const setSlide = instance.sn.bind(instance);
        instance.sn = n => {
            setSlide(n);
            currentSlide.value = n;
        };
    }
}

function openCurrent() {
    const item = entries.value[currentSlide.value - 1];
    if (item) window.open(props.dataset.downloadUrl(item.path, { inline: true }), '_blank');
}

defineExpose({ open, supports });
</script>

<style scoped>
.lightbox-toolbar-extra {
    position: fixed;
    right: 90px;
    background: rgba(35, 35, 35, .65);
    top: 0;
    height: 45px;
    width: 45px;
    z-index: 1000000001;
    display: flex;
    align-items: center;
    justify-content: center;
}

.lightbox-open-fullsize {
    cursor: pointer;
    color: var(--ddb-text-on-dark);
    font-size: var(--ddb-font-size-lg);
    padding: var(--ddb-spacing-sm) var(--ddb-spacing-md);
    border: none;
    background: none;
    border-radius: var(--ddb-radius-sm);
    transition: color 0.2s, background-color 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
}

.lightbox-open-fullsize:hover {
    color: var(--ddb-text-on-color);
    background-color: rgba(255, 255, 255, 0.15);
}

.lightbox-info-overlay {
    position: fixed;
    bottom: var(--ddb-spacing-xl);
    left: 50%;
    transform: translateX(-50%);
    z-index: 1000000001;
    background: var(--ddb-overlay-bg);
    color: var(--ddb-text-on-dark);
    padding: var(--ddb-spacing-sm) var(--ddb-spacing-lg);
    border-radius: var(--ddb-radius-md);
    font-size: var(--ddb-font-size-base);
    display: flex;
    align-items: center;
    gap: var(--ddb-spacing-lg);
    white-space: nowrap;
    backdrop-filter: blur(var(--ddb-spacing-xs));
    pointer-events: none;
    user-select: none;
    max-width: 90vw;
    overflow: hidden;
    text-overflow: ellipsis;
}

.lightbox-info-name {
    font-weight: 600;
    max-width: var(--ddb-tooltip-max-width);
    overflow: hidden;
    text-overflow: ellipsis;
}

.lightbox-info-coords,
.lightbox-info-altitude {
    display: flex;
    align-items: center;
    opacity: 0.9;
}
</style>
