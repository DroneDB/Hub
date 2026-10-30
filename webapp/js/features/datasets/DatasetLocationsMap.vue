<template>
    <div class="dlm">
        <div class="dlm-map-wrap">
            <div ref="mapEl" class="dlm-map" />

            <div v-if="loading" class="dlm-status" role="status">
                <i class="fa-solid fa-spinner fa-spin" aria-hidden="true" /> Loading locations&hellip;
            </div>

            <div v-if="empty" class="dlm-empty">
                <EmptyState title="No datasets to show on the map">
                    <p>Datasets with images that have a GPS position, orthophotos, point clouds or other georeferenced data appear here.</p>
                </EmptyState>
            </div>

            <ul v-if="multiOrg" class="dlm-legend" aria-label="Organizations">
                <li v-for="entry in legend" :key="entry.org">
                    <span class="dlm-swatch" :style="{ background: entry.colour }" aria-hidden="true" />
                    <span class="dlm-legend-name">{{ entry.orgName }}</span>
                </li>
            </ul>

            <!-- Moved into the map by the overlay; the content is rendered here -->
            <div ref="popupEl" class="dlm-popup" role="dialog" aria-label="Dataset">
                <template v-if="popup">
                    <button type="button" class="dlm-popup-close" title="Close" aria-label="Close" @click="closePopup">
                        <i class="fa-solid fa-xmark" aria-hidden="true" />
                    </button>
                    <ul class="dlm-popup-list">
                        <li v-for="pin in popup.pins" :key="pin.org + '/' + pin.slug" class="dlm-popup-item">
                            <div class="dlm-popup-text">
                                <div class="dlm-popup-name">{{ pin.name }}</div>
                                <div class="dlm-popup-org">{{ pin.orgName }}</div>
                            </div>
                            <Button size="small" label="Open" icon="fa-regular fa-folder-open" @click="openDataset(pin)" />
                        </li>
                    </ul>
                </template>
            </div>
        </div>

        <aside v-if="without.length" class="dlm-without">
            <button type="button" class="dlm-without-toggle" :aria-expanded="withoutOpen" aria-controls="dlm-without-list"
                    @click="withoutOpen = !withoutOpen">
                <i :class="withoutOpen ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-right'" aria-hidden="true" />
                {{ without.length }} {{ without.length === 1 ? 'dataset' : 'datasets' }} without a location
            </button>
            <ul v-show="withoutOpen" id="dlm-without-list" class="dlm-without-list">
                <li v-for="dataset in without" :key="dataset.org + '/' + dataset.slug">
                    <router-link :to="{ name: 'ViewDataset', params: { org: dataset.org, ds: dataset.slug } }">{{ dataset.name }}</router-link>
                    <small v-if="severalOrgsListed" class="dlm-without-org">{{ dataset.orgName }}</small>
                </li>
            </ul>
        </aside>
    </div>
</template>

<script setup>
/**
 * DatasetLocationsMap - a map of where datasets are: one pin per dataset at the centre of its
 * bounding box, grouped into counted clusters when they crowd. The datasets that have no
 * location are listed beside the map (below it on a narrow screen).
 *
 * The pins are the `groups` it is given, `{ org, orgName, datasets: [{ slug, name, bbox }] }` per
 * organization, and follow them as groups are added, so the page can show an answer as it
 * arrives. While the user has not moved the map it keeps every pin in view. Pointing at a pin (or
 * opening it) draws the box of its dataset; a cluster zooms in; a pin opens a popup with the
 * dataset and a button to open it. With more than one organization the pins take a colour each,
 * explained by a legend: the colour of an organization is given by its place among `organizations`
 * sorted, so it is the same on every load whatever order the groups arrive in.
 */
import 'ol/ol.css';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Map, View } from 'ol';
import Feature from 'ol/Feature';
import Overlay from 'ol/Overlay';
import { Vector as VectorLayer } from 'ol/layer';
import { Vector as VectorSource, Cluster } from 'ol/source';
import { fromExtent } from 'ol/geom/Polygon';
import { createEmpty, extend as extendExtent, isEmpty as isEmptyExtent } from 'ol/extent';
import Button from 'primevue/button';
import EmptyState from '@/components/EmptyState.vue';
import { useMapBasemap } from '@/composables/useMapBasemap';
import { useListenerBag } from '@/composables/useEventListener';
import { buildLocations, bboxExtent, organizationColours } from '@/libs/map/datasetLocations';
import { createLocationStyles } from '@/libs/map/locationStyles';
import { FIT_OPTIONS } from '@/libs/map/mapUtils';
import { isMobile } from '@/libs/responsive';

defineOptions({ name: 'DatasetLocationsMap' });

const props = defineProps({
    /** The datasets by organization: [{ org, orgName, datasets: [{ slug, name, bbox }] }] */
    groups: { type: Array, default: () => [] },
    /** More groups are still coming */
    loading: { type: Boolean, default: false },
    /**
     * The slugs of all the organizations the page may show, which give the colours: an organization
     * keeps its colour while the groups shown are a subset of them (a search). By default, those
     * of the groups.
     */
    organizations: { type: Array, default: null }
});

// Pins closer than this many pixels make a cluster
const CLUSTER_DISTANCE = 40;
// Zoom for one place (a single pin, or pins all at one point)
const SINGLE_PLACE_ZOOM = 13;

const router = useRouter();
const listeners = useListenerBag();
const mapEl = ref(null);
const popupEl = ref(null);
const map = shallowRef(null);
const { createBasemapLayer } = useMapBasemap(map);

// Organization -> colour, from the organizations the page knows rather than the groups so far
const colours = computed(() => organizationColours(props.organizations ?? props.groups.map(group => group.org)));
const built = computed(() => buildLocations(props.groups, colours.value));
const without = computed(() => built.value.without);
const legend = computed(() => built.value.legend);
const multiOrg = computed(() => legend.value.length > 1);
// The list beside the map names organizations when it mixes datasets of several
const severalOrgsListed = computed(() =>
    new Set([...legend.value.map(entry => entry.org), ...without.value.map(dataset => dataset.org)]).size > 1);
const empty = computed(() => !props.loading && built.value.features.length === 0);
const withoutOpen = ref(!isMobile());

const styles = createLocationStyles({ coloured: () => multiOrg.value });
const pinSource = new VectorSource();
const pinLayer = new VectorLayer({
    source: new Cluster({ distance: CLUSTER_DISTANCE, source: pinSource }),
    style: styles.pin
});
const boxSource = new VectorSource();
const boxLayer = new VectorLayer({ source: boxSource, style: styles.box });

/** The popup: the pins it lists. @type {import('vue').ShallowRef<{ pins: object[] }|null>} */
const popup = shallowRef(null);
const hovered = shallowRef(null);
let overlay = null;
let resizeObserver = null;
// True until the user moves the map: the view then follows the pins
let followPins = true;

/** The data of a pin feature. @param {Feature} feature */
function pinData(feature) {
    const { org, orgName, slug, name, bbox, colour } = feature.getProperties();
    return { org, orgName, slug, name, bbox, colour };
}

/** The box shown: that of the dataset in the popup, else of the pin under the pointer. */
const highlighted = computed(() => (popup.value ? (popup.value.pins.length === 1 ? popup.value.pins[0] : null) : hovered.value));

watch(highlighted, pin => {
    boxSource.clear(true);
    if (!pin) return;
    const box = new Feature(fromExtent(bboxExtent(pin.bbox)));
    box.set('colour', pin.colour);
    boxSource.addFeature(box);
});

/** Moves the view to show every pin. @param {boolean} animate */
function fitToPins(animate) {
    const view = map.value?.getView();
    const extent = pinSource.getExtent();
    if (!view || isEmptyExtent(extent)) return;
    const duration = animate ? FIT_OPTIONS.duration : 0;
    if (extent[0] === extent[2] && extent[1] === extent[3]) {
        view.animate({ center: [extent[0], extent[1]], zoom: SINGLE_PLACE_ZOOM, duration });
    } else {
        view.fit(extent, { ...FIT_OPTIONS, duration });
    }
}

watch(built, ({ features }) => {
    pinSource.clear(true);
    pinSource.addFeatures(features);
    // Pins the popup lists may have gone (a new set of groups); one that is still there stays open
    if (popup.value && !popup.value.pins.every(pin => pinSource.getFeatureById(`${pin.org}/${pin.slug}`))) closePopup();
    if (hovered.value && !pinSource.getFeatureById(`${hovered.value.org}/${hovered.value.slug}`)) hovered.value = null;
    // A new set of groups begins again
    if (props.groups.length === 0) followPins = true;
    if (followPins) fitToPins(false);
}, { immediate: true });

watch(() => props.loading, loading => {
    if (!loading && followPins) fitToPins(true);
});

/** The cluster (one or more pins) drawn at `pixel`. */
const clusterAt = pixel => map.value.forEachFeatureAtPixel(pixel, feature => feature,
    { layerFilter: layer => layer === pinLayer, hitTolerance: 4 });

function onPointerMove(event) {
    if (event.dragging) return;
    const cluster = clusterAt(event.pixel);
    map.value.getTargetElement().style.cursor = cluster ? 'pointer' : '';
    const pins = cluster?.get('features');
    hovered.value = pins?.length === 1 ? pinData(pins[0]) : null;
}

function onMapClick(event) {
    const cluster = clusterAt(event.pixel);
    if (!cluster) {
        closePopup();
        return;
    }
    const members = cluster.get('features');
    const extent = createEmpty();
    members.forEach(pin => extendExtent(extent, pin.getGeometry().getExtent()));
    const span = Math.max(extent[2] - extent[0], extent[3] - extent[1]);
    const view = map.value.getView();
    // Pins that zooming cannot tell apart are listed. The fit stops at the closest zoom it
    // allows, and a cluster holds pins up to twice its distance apart (each one within the
    // distance of the pin it gathered around): a cluster no wider than that at the closest zoom,
    // or any cluster once the view is there, would still be one after the fit, which would not
    // move the view at all.
    const atClosestZoom = view.getResolution() <= FIT_OPTIONS.minResolution;
    if (members.length === 1 || atClosestZoom || span <= 2 * CLUSTER_DISTANCE * FIT_OPTIONS.minResolution) {
        openPopup(members.map(pinData), [(extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2]);
    } else {
        view.fit(extent, FIT_OPTIONS);
    }
}

async function openPopup(pins, coordinate) {
    popup.value = { pins };
    // The content is in the document before the overlay measures it to keep it in view
    await nextTick();
    overlay?.setPosition(coordinate);
}

function closePopup() {
    popup.value = null;
    overlay?.setPosition(undefined);
}

function openDataset(pin) {
    router.push({ name: 'ViewDataset', params: { org: pin.org, ds: pin.slug } });
}

/** The user moves the map: it stops following the pins. */
function stopFollowing() {
    followPins = false;
}

onMounted(() => {
    map.value = new Map({
        target: mapEl.value,
        // The basemap must be layer 0 (useMapBasemap replaces it)
        layers: [createBasemapLayer(), pinLayer, boxLayer],
        view: new View({ center: [0, 0], zoom: 2 })
    });
    overlay = new Overlay({
        element: popupEl.value,
        positioning: 'bottom-center',
        offset: [0, -14],
        stopEvent: true,
        autoPan: { animation: { duration: 200 }, margin: 20 }
    });
    map.value.addOverlay(overlay);

    listeners.ol([map.value.on('pointermove', onPointerMove), map.value.on('click', onMapClick)]);
    // Escape closes the popup, from the button inside it
    listeners.add(popupEl.value, 'keydown', event => { if (event.key === 'Escape') closePopup(); });
    for (const type of ['pointerdown', 'wheel']) listeners.add(mapEl.value, type, stopFollowing, { passive: true });

    // The container changes size with the window and the list beside the map
    resizeObserver = new ResizeObserver(() => {
        map.value?.updateSize();
        if (followPins) fitToPins(false);
    });
    resizeObserver.observe(mapEl.value);
    fitToPins(false);
});

onBeforeUnmount(() => {
    resizeObserver?.disconnect();
    listeners.dispose();
    if (map.value) {
        map.value.removeOverlay(overlay);
        map.value.setTarget(null);
        map.value.dispose();
    }
    overlay = null;
    map.value = null;
});
</script>

<style scoped>
.dlm {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--ddb-spacing-sm);
    overflow-y: auto;
}

.dlm-map-wrap {
    position: relative;
    flex: 1;
    min-height: 20rem;
    min-width: 0;
    border-radius: var(--ddb-radius-md);
    overflow: hidden;
    border: 1px solid var(--p-content-border-color);
}

.dlm-map {
    position: absolute;
    inset: 0;
}

.dlm-status {
    position: absolute;
    top: var(--ddb-spacing-sm);
    left: 50%;
    transform: translateX(-50%);
    padding: var(--ddb-spacing-xs) var(--ddb-spacing-md);
    border-radius: var(--ddb-radius-md);
    background: var(--p-content-background);
    box-shadow: 0 0.125rem 0.5rem rgba(0, 0, 0, 0.25);
    font-size: var(--ddb-font-size-sm);
    pointer-events: none;
}

.dlm-empty {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--p-content-background) 85%, transparent);
    pointer-events: none;
}

.dlm-legend {
    position: absolute;
    left: var(--ddb-spacing-sm);
    bottom: var(--ddb-spacing-lg);
    margin: 0;
    padding: var(--ddb-spacing-xs) var(--ddb-spacing-sm);
    list-style: none;
    max-width: 14rem;
    max-height: 40%;
    overflow-y: auto;
    border-radius: var(--ddb-radius-md);
    background: var(--p-content-background);
    box-shadow: 0 0.125rem 0.5rem rgba(0, 0, 0, 0.25);
    font-size: var(--ddb-font-size-sm);
}

.dlm-legend li {
    display: flex;
    align-items: center;
    gap: var(--ddb-spacing-xs);
}

.dlm-swatch {
    flex-shrink: 0;
    width: 0.75rem;
    height: 0.75rem;
    border-radius: 50%;
}

.dlm-legend-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.dlm-popup {
    position: relative;
    min-width: 14rem;
    max-width: 20rem;
    padding: var(--ddb-spacing-sm);
    border-radius: var(--ddb-radius-md);
    background: var(--p-content-background);
    color: var(--p-text-color);
    box-shadow: 0 0.25rem 1rem rgba(0, 0, 0, 0.3);
}

.dlm-popup::after {
    content: "";
    position: absolute;
    left: 50%;
    bottom: -0.5rem;
    margin-left: -0.5rem;
    border-left: 0.5rem solid transparent;
    border-right: 0.5rem solid transparent;
    border-top: 0.5rem solid var(--p-content-background);
}

.dlm-popup-close {
    position: absolute;
    top: 0.125rem;
    right: 0.125rem;
    width: 1.5rem;
    height: 1.5rem;
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
}

.dlm-popup-list {
    margin: 0;
    padding: 0;
    list-style: none;
    max-height: 14rem;
    overflow-y: auto;
}

.dlm-popup-item {
    display: flex;
    align-items: center;
    gap: var(--ddb-spacing-sm);
    padding: var(--ddb-spacing-xs) 1.25rem var(--ddb-spacing-xs) 0;
}

.dlm-popup-text {
    min-width: 0;
    flex: 1;
}

.dlm-popup-name {
    font-weight: bold;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.dlm-popup-org {
    color: var(--ddb-text-secondary);
    font-size: var(--ddb-font-size-sm);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.dlm-without {
    flex-shrink: 0;
    min-width: 0;
}

.dlm-without-toggle {
    display: flex;
    align-items: center;
    gap: var(--ddb-spacing-xs);
    width: 100%;
    padding: var(--ddb-spacing-xs) 0;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    font-weight: bold;
    text-align: left;
    cursor: pointer;
}

.dlm-without-list {
    margin: 0;
    padding: 0;
    list-style: none;
    max-height: 12rem;
    overflow-y: auto;
}

.dlm-without-list li {
    display: flex;
    flex-direction: column;
    padding: var(--ddb-spacing-xs) 0;
}

.dlm-without-org {
    color: var(--ddb-text-secondary);
}

/* Beside the map on a wide screen */
@media screen and (min-width: 768px) {
    .dlm {
        flex-direction: row;
        overflow-y: hidden;
    }

    .dlm-without {
        width: 16rem;
        overflow-y: auto;
    }

    .dlm-without-list {
        max-height: none;
    }
}
</style>
