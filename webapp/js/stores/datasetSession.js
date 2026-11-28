// @ts-check
/**
 * State shared by the dataset page and the header toolbar: the selection, the active
 * tab, the bulk download, the settings request, whether the user may write the dataset. The toolbar reads the page's state
 * instead of a copy kept in step through events.
 */
import { defineStore } from 'pinia';
import { ref, shallowRef, triggerRef } from 'vue';

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
    // whole-dataset download question
    const rootEntry = shallowRef(null);
    // When the dataset was created, from the Registry's dataset list (the root entry does not carry it): the
    // Created row of its Properties. Null until it is read.
    const creationDate = ref(/** @type {number|string|null} */ (null));

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

    /**
     * A meta value of the dataset changed (its visibility, from the header): the root entry takes it. The entry is
     * changed in place, not replaced: the page and the viewer that put it in the session hold the same object (a
     * viewer takes it out only if it is still the one it put there), and they see the new value too. What reads the
     * entry is told (triggerRef); a computed or watch that returns the entry itself sees the same object and stops
     * there, so read the value through `rootEntry` in the same getter.
     * @param {string} key  the meta key ('visibility')
     * @param {object} value  the meta item the server returned ({ id, data })
     */
    function setRootMeta(key, value) {
        const entry = rootEntry.value;
        if (!entry) return;
        entry.properties ??= {};
        entry.properties.meta ??= {};
        entry.properties.meta[key] = value;
        triggerRef(rootEntry);
    }

    /** @param {number|string|null} value */
    function setCreationDate(value) {
        creationDate.value = value ?? null;
    }

    /** Leaving the dataset: nothing selected, no tab, no archive in progress, nothing refused. */
    function reset() {
        selectedFiles.value = [];
        activeTab.value = null;
        activeBulkDownload.value = false;
        unavailable.value = false;
        canWrite.value = false;
        rootEntry.value = null;
        creationDate.value = null;
    }

    return {
        selectedFiles, activeTab, activeBulkDownload, settingsRequests, unavailable, canWrite, rootEntry, creationDate,
        setSelectedFiles, setActiveTab, setActiveBulkDownload, requestSettings, setUnavailable, setCanWrite, setRootEntry, setRootMeta, setCreationDate, reset
    };
});
