// @ts-check
/**
 * State shared by the dataset page and the header toolbar: the selection, the active
 * tab, the bulk download, the settings request, whether the user may write the dataset. The toolbar reads the page's state
 * instead of a copy kept in step through events.
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
    // The dataset did not load (not found, no access, sign in): the toolbar offers nothing on it
    const unavailable = ref(false);
    // The user may write the dataset (the page's permissions): the header's actions follow them
    const canWrite = ref(false);
    // The dataset's root entry: its file count (properties.entries) and total size, for the header's
    // whole-dataset download question (FR-EXP-27)
    const rootEntry = shallowRef(null);

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

    /** @param {boolean} value  the page shows the state of a dataset that did not load (ResourceState) */
    function setUnavailable(value) {
        unavailable.value = !!value;
    }

    /** @param {boolean} value */
    function setCanWrite(value) {
        canWrite.value = !!value;
    }

    /** @param {object|null} entry  the dataset's root entry, null when there is none */
    function setRootEntry(entry) {
        rootEntry.value = entry || null;
    }

    /** Leaving the dataset: nothing selected, no tab, no archive in progress, nothing refused. */
    function reset() {
        selectedFiles.value = [];
        activeTab.value = null;
        activeBulkDownload.value = false;
        unavailable.value = false;
        canWrite.value = false;
        rootEntry.value = null;
    }

    return {
        selectedFiles, activeTab, activeBulkDownload, settingsRequests, unavailable, canWrite, rootEntry,
        setSelectedFiles, setActiveTab, setActiveBulkDownload, requestSettings, setUnavailable, setCanWrite, setRootEntry, reset
    };
});
