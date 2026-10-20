// @ts-check
/**
 * State shared by the dataset page and the header toolbar (HQ-04). Replaces five
 * event-bus messages between the two (selection, active tab, bulk download, settings
 * request, download limit), so the toolbar reads the page's state instead of a copy.
 */
import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';

export const useDatasetSessionStore = defineStore('datasetSession', () => {
    // Selected explorer items ({ path, entry, ... }); shallow: the page owns the objects
    const selectedFiles = shallowRef([]);
    // Main tab of the dataset page ('explorer', 'filebrowser', 'map', ...), null off the page
    const activeTab = ref(null);
    // A download archive is being prepared (queued/running bulk-download task)
    const activeBulkDownload = ref(false);
    // Incremented when the toolbar asks the page to open the dataset settings
    const settingsRequests = ref(0);

    /** @param {Array<object>} files */
    function setSelectedFiles(files) {
        selectedFiles.value = Array.isArray(files) ? [...files] : [];
    }

    /** @param {string|null} key */
    function setActiveTab(key) {
        activeTab.value = key;
    }

    /** @param {boolean} active */
    function setActiveBulkDownload(active) {
        activeBulkDownload.value = !!active;
    }

    function requestSettings() {
        settingsRequests.value++;
    }

    /** Leaving the dataset: nothing selected, no tab, no archive in progress. */
    function reset() {
        selectedFiles.value = [];
        activeTab.value = null;
        activeBulkDownload.value = false;
    }

    return {
        selectedFiles, activeTab, activeBulkDownload, settingsRequests,
        setSelectedFiles, setActiveTab, setActiveBulkDownload, requestSettings, reset
    };
});
