<template>
    <section class="info-panel" aria-label="About this splat">
        <header>
            <h3>About this splat</h3>
            <button class="panel-action" title="Close" aria-label="Close" @click="emit('close')">
                <i class="fa-solid fa-xmark" />
            </button>
        </header>
        <dl>
            <template v-for="row in rows" :key="row.id">
                <dt>{{ row.label }}</dt>
                <dd>{{ row.value }}</dd>
            </template>
        </dl>
        <div v-if="downloads.length" class="downloads" role="group" aria-label="Downloads">
            <button v-for="download in downloads" :key="download.id" class="download" @click="emit('download', download)">
                <i :class="download.icon" /> {{ download.label }}
            </button>
        </div>
    </section>
</template>

<script setup>
/**
 * SplatInfoPanel - the popover of the splat viewer that says what the splat is (splat count, colour
 * detail, size, level of detail, georeference, estimated up, quality) and offers its downloads.
 * The level-of-detail line follows the streaming while the panel is open: the pager is read once
 * a second (the shared ticker, which stops with the page hidden), not on every frame.
 */
import { ref, computed, onBeforeUnmount } from 'vue';
import { onTick } from '@/libs/clock';
import { pagerState, splatInfoRows } from './splatInfo';

const props = defineProps({
    /** What splatInfoRows reads besides the pager: { entry, bounds, scale, streaming, quality } */
    info: { type: Object, required: true },
    /** Gives Spark's pager (null before there is one) */
    readPager: { type: Function, default: () => null },
    /** The downloads on offer (splatDownloadsOf) */
    downloads: { type: Array, default: () => [] }
});
const emit = defineEmits(['close', 'download']);

const lod = ref(pagerState(props.readPager()));
const stopTicking = onTick(() => { lod.value = pagerState(props.readPager()); });
onBeforeUnmount(stopTicking);

const rows = computed(() => splatInfoRows({ ...props.info, lod: lod.value }));
</script>

<style scoped>
.info-panel {
    position: absolute;
    /* Beside the camera rail on the left edge, not over it (desktop and phone) */
    left: calc(var(--splat-rail-width) + var(--ddb-spacing-sm));
    bottom: calc(var(--ddb-spacing-md) + 2.25rem + 0.5rem);
    z-index: 100;
    width: min(24rem, calc(100% - var(--splat-rail-width) - var(--ddb-spacing-sm) - var(--ddb-spacing-md)));
    box-sizing: border-box;
    max-height: 60vh;
    overflow-y: auto;
    padding: 0.6rem 0.75rem;
    background: var(--ddb-overlay-bg);
    border: var(--ddb-border-width) solid rgba(255, 255, 255, 0.25);
    border-radius: var(--ddb-border-radius, 4px);
    color: var(--ddb-text-on-dark);
    text-align: left;
}

header {
    display: flex;
    align-items: center;
    gap: 0.25rem;
}

h3 {
    flex: 1 1 auto;
    margin: 0;
    font-size: 1rem;
}

.panel-action {
    flex: 0 0 auto;
    width: 1.8rem;
    height: 1.8rem;
    border: none;
    border-radius: var(--ddb-border-radius, 4px);
    background: transparent;
    color: inherit;
    cursor: pointer;
}

.panel-action:hover {
    background: rgba(255, 255, 255, 0.15);
}

dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.25rem 0.75rem;
    margin: 0.5rem 0;
    font-size: var(--ddb-font-size-sm, 0.8rem);
}

dt {
    opacity: 0.7;
}

dd {
    margin: 0;
    overflow-wrap: anywhere;
}

.downloads {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding-top: 0.5rem;
    border-top: 1px solid rgba(255, 255, 255, 0.2);
}

.download {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.3rem 0.5rem;
    border: 1px solid rgba(255, 255, 255, 0.35);
    border-radius: var(--ddb-border-radius, 4px);
    background: transparent;
    color: inherit;
    font-size: var(--ddb-font-size-sm, 0.8rem);
    text-align: left;
    cursor: pointer;
}

.download:hover {
    background: rgba(255, 255, 255, 0.15);
}
</style>
