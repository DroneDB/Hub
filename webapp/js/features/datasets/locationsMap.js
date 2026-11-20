// @ts-check
/**
 * The overview map of dataset locations, in a chunk of its own: OpenLayers loads when a page first
 * shows the map view, not with the page. It renders in place, so the loader does not cover the page.
 */
import { lazyComponent } from '@/libs/lazyComponent';

export const DatasetLocationsMap = lazyComponent(
    () => import(/* webpackChunkName: "dataset-locations-map" */ './DatasetLocationsMap.vue'),
    { showLoader: false });
