<template>
    <PhotoLightbox v-if="gallery" v-model:index="gallery.index" visible :dataset="dataset" :photos="gallery.photos"
                   @close="gallery = null" />
    <VideoLightbox v-if="video" visible :src="video.src" :entry="video.entry" :dataset="dataset" @close="video = null" />
</template>

<script setup>
/**
 * The dataset page's photo and video lightboxes: the photos of the folder on show in the zoom
 * viewer (PhotoLightbox, FR-VWR-12), or one video.
 *
 *   lightbox.value.open(node, files)   // a photo: every photo of `files`; a video: just it
 */
import { ref } from 'vue';
import ddb from 'ddb';
import { lazyComponent } from '@/libs/lazyComponent';

const PhotoLightbox = lazyComponent(() => import(/* webpackChunkName: "dataset-lightbox" */ './PhotoLightbox.vue'), { showLoader: false });
const VideoLightbox = lazyComponent(() => import(/* webpackChunkName: "dataset-lightbox" */ './VideoLightbox.vue'), { showLoader: false });

const props = defineProps({
    dataset: { type: Object, required: true }
});

const T = ddb.entry.type;
const isPhoto = entry => entry.type === T.IMAGE || entry.type === T.GEOIMAGE;
const isVideo = entry => entry.type === T.VIDEO || entry.type === T.GEOVIDEO;
const pathOf = item => ddb.utils.datasetPathFromUri(item.path)[1];

/** @type {import('vue').Ref<{ photos: { path: string, entry: object }[], index: number } | null>} */
const gallery = ref(null);
const video = ref(null);

/** Whether the lightbox shows this kind of entry. */
function supports(entry) {
    return isPhoto(entry) || isVideo(entry);
}

/** Shows a photo among the photos of `files`, or a video. */
function open(node, files) {
    if (isVideo(node.entry)) {
        const path = pathOf(node);
        video.value = { src: props.dataset.downloadUrl(path, { inline: true }), entry: { ...node.entry, path } };
        return;
    }
    const photos = files.filter(f => isPhoto(f.entry)).map(f => ({ path: pathOf(f), entry: f.entry }));
    if (!photos.length) return;
    gallery.value = { photos, index: Math.max(photos.findIndex(p => p.path === pathOf(node)), 0) };
}

defineExpose({ open, supports });
</script>
