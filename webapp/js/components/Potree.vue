<template>
    <div id="potree">
        <TabViewLoader @loaded="handleLoad" titleSuffix="Point Cloud" />

        <Message bindTo="error" noDismiss />
        <Message bindTo="success" className="positive" />
        <div v-if="loading" class="loading">
            <p>Loading point cloud...</p>
            <i class="icon circle notch spin" />
        </div>

        <div class="potree-container" :class="{ loading }">
            <!-- Toolbar for measurements -->
            <div v-if="loaded && (hasMeasurements || hasSavedMeasurements)" class="measurements-toolbar">
                <button
                    v-if="hasMeasurements"
                    @click="saveMeasurements"
                    :disabled="savingMeasurements"
                    class="btn-measurement"
                    title="Save measurements">
                    <i class="save icon"></i>
                    Save Measurements
                </button>

                <button
                    v-if="hasSavedMeasurements"
                    @click="deleteSavedMeasurements"
                    class="btn-measurement btn-danger"
                    title="Delete saved measurements file">
                    <i class="trash icon"></i>
                    Delete Saved
                </button>
            </div>

            <div id="potree_sidebar_container" ref="sidebar"> </div>
            <div id="potree_render_area" ref="container"></div>
        </div>
        <ConfirmDialog v-if="deleteMeasurementsDialogOpen"
            title="Delete Saved Measurements"
            message="Are you sure you want to delete all saved measurements?"
            confirmText="Delete"
            cancelText="Cancel"
            confirmButtonClass="negative"
            warningTitle="Warning"
            warningMessage="This action cannot be undone."
            @onClose="handleDeleteMeasurementsDialogClose">
        </ConfirmDialog>
    </div>
</template>

<script>
import ddb from 'ddb';
import Message from './Message';
import TabViewLoader from './TabViewLoader';
import ConfirmDialog from './ConfirmDialog.vue';
import { loadResources } from '../libs/lazy';
import { MeasurementStorage } from '../libs/measurementStorage';
import { exportMeasurements, importMeasurements } from '../libs/potreeMeasurementConverter';

export default {
    components: {
        Message, TabViewLoader, ConfirmDialog
    },
    props: ['uri'],
    data: function () {
        return {
            error: "",
            success: "",
            loading: false,
            loaded: false,
            measurementStorage: null,
            coordinateSystem: null,
            hasSavedMeasurements: false,
            savingMeasurements: false,

            // Confirm dialog
            deleteMeasurementsDialogOpen: false,

            // Dataset permissions (set by TabViewLoader)
            canRead: false,
            canWrite: false,
            canDelete: false,

            // Track measurement count for reactivity
            measurementCount: 0
        };
    },
    mounted: function () {
    },

    computed: {
        /**
         * Check if there are any measurements in the viewer
         */
        hasMeasurements: function() {
            return this.measurementCount > 0;
        }
    },

    methods: {

        /**
         * Setup listeners to track measurement additions/removals
         */
        setupMeasurementListeners: function() {
            if (!this.viewer || !this.viewer.scene) return;

            const scene = this.viewer.scene;
            const self = this;

            // Helper to update measurement count
            const updateCount = () => {
                const measurements = (scene.measurements ? scene.measurements.length : 0);
                const profiles = (scene.profiles ? scene.profiles.length : 0);
                const volumes = (scene.volumes ? scene.volumes.length : 0);
                self.measurementCount = measurements + profiles + volumes;
            };

            // Listen to measurement events
            scene.addEventListener('measurement_added', updateCount);
            scene.addEventListener('measurement_removed', updateCount);
            scene.addEventListener('profile_added', updateCount);
            scene.addEventListener('profile_removed', updateCount);
            scene.addEventListener('volume_added', updateCount);
            scene.addEventListener('volume_removed', updateCount);

            // Initial count
            updateCount();
        },

        handleLoad: async function () {
            try {
                // Quick type check
                if (this.entry.type !== ddb.entry.type.POINTCLOUD) throw new Error(`${this.entry.path} cannot be opened as a point cloud`);

                this.loading = true;

                await loadResources("/potree/build/potree/potree.isolated.min.css");
                await loadResources("/potree/libs/jquery-ui/jquery-ui.min.css");
                await loadResources("/potree/libs/spectrum/spectrum.css");
                await loadResources("/potree/libs/jstree/themes/mixed/style.css");
                await loadResources("/potree/libs/jquery/jquery-3.1.1.min.js");
                await loadResources("/potree/libs/spectrum/spectrum.js");
                await loadResources("/potree/libs/jquery-ui/jquery-ui.min.js");
                await loadResources("/potree/libs/three.js/build/three.min.js");
                await loadResources("/potree/libs/three.js/extra/lines.js");
                await loadResources("/potree/libs/other/BinaryHeap.js");
                await loadResources("/potree/libs/tween/tween.min.js");
                await loadResources("/potree/libs/d3/d3.js");
                await loadResources("/potree/libs/proj4/proj4.js");
                await loadResources("/potree/libs/i18next/i18next.js");
                await loadResources("/potree/libs/jstree/jstree.js");
                await loadResources("/potree/build/potree/potree.js");
                await loadResources("/potree/libs/plasio/js/laslaz.js");

                await this.loadViewer();

            } catch (e) {
                this.error = e.message;
            } finally {
                this.loading = false;
            }
        },
        loadViewer: async function () {
            this.error = "";

            if (this.viewer) {
                this.viewer = null;
                this.$refs.container.innerHTML = '';
            }

            let viewer = new Potree.Viewer(this.$refs.container);

            viewer.toggleSidebar = () => {
                let renderArea = this.$refs.container;
                let isVisible = renderArea.style.right === '300px';

                if (isVisible) {
                    renderArea.style.right = '0px';
                } else {
                    renderArea.style.right = '300px';
                }
            };
            viewer.setEDLEnabled(false);
            viewer.setFOV(60);
            viewer.setPointBudget(10 * 1000 * 1000);
            viewer.loadGUI(() => {
                viewer.setLanguage('en');
                $("#menu_tools").next().show();
                // viewer.toggleSidebar();
            });

            viewer.scene.scene.add(new THREE.AmbientLight(0x404040, 2.0)); // soft white light );
            viewer.scene.scene.add(new THREE.DirectionalLight(0xcccccc, 0.5));

            const directional = new THREE.DirectionalLight(0xcccccc, 0.5);
            directional.position.z = 99999999999;
            viewer.scene.scene.add(directional);

            this.loaded = true;
            this.viewer = viewer;

            // Setup measurement tracking listeners
            this.setupMeasurementListeners();

            await this.addPointCloud(this.dataset.Entry(this.entry));
            this.viewer.fitToScreen();

            // Load saved measurements automatically
            await this.loadMeasurements();

            window.viewer = viewer;
            // if (pointCloudFiles.length === 0) this.error = "No point cloud files selected. Select one or more point cloud files to display them.";
        },

        addPointCloud: async function (entry) {
            return new Promise(async (resolve, reject) => {
                try {
                    const eptUrl = await entry.getEpt();
                    const basename = ddb.pathutils.basename(entry.path);

                    // Load coordinate system
                    this.coordinateSystem = await this.getCoordinateSystem(eptUrl);
                    console.log('Coordinate system:', this.coordinateSystem);

                    Potree.loadPointCloud(eptUrl, basename, e => {
                        if (e.type == "loading_failed") {
                            reject(new Error(`Unable to load ${entry.path}.\n\nThe file may still be processing. Return to the file list to check the build status, or try again in a few minutes.`));
                            return;
                        }

                        this.viewer.scene.addPointCloud(e.pointcloud);
                        e.pointcloud.material.size = 1;

                        resolve();
                    });
                } catch (e) {
                    reject(new Error(`${entry.path} is being processed.\n\nReturn to the file list to check the status or try again in a few minutes.`));
                }
            });
        },

        /**
         * Load the coordinate system from EPT
         */
        getCoordinateSystem: async function(eptUrl) {
            try {
                const response = await fetch(eptUrl);
                const eptJson = await response.json();

                return {
                    srs: eptJson.srs || eptJson.srs?.wkt || null,
                    scale: eptJson.scale || [1, 1, 1],
                    offset: eptJson.offset || [0, 0, 0],
                    bounds: eptJson.bounds || eptJson.boundsConforming
                };
            } catch (e) {
                console.warn('Could not load coordinate system:', e);
                // Fallback
                return {
                    srs: null,
                    scale: [1, 1, 1],
                    offset: [0, 0, 0],
                    bounds: null
                };
            }
        },

        /**
         * Load saved measurements
         */
        loadMeasurements: async function() {
            if (!this.measurementStorage) {
                this.measurementStorage = new MeasurementStorage(this.dataset, this.entry);
            }

            try {
                // Check if saved measurements exist
                const geojson = await this.measurementStorage.load();

                if (geojson && geojson.features && geojson.features.length > 0) {
                    // Import measurements into viewer
                    importMeasurements(geojson, this.viewer, this.coordinateSystem);

                    this.hasSavedMeasurements = true;
                    console.log(`Loaded ${geojson.features.length} measurements`);

                    // Show info message to user
                    this.success = `${geojson.features.length} measurement${geojson.features.length > 1 ? 's' : ''} loaded`;
                }
            } catch (e) {
                console.error('Error loading measurements:', e);
                this.error = `Could not load measurements: ${e.message}`;
            }
        },

        /**
         * Save current measurements
         */
        saveMeasurements: async function() {
            // Check write permissions first
            if (!this.canWrite) {
                this.error = 'You do not have permission to save measurements in this dataset';
                return;
            }

            if (!this.viewer || !this.viewer.scene) {
                this.error = 'Viewer not ready';
                return;
            }

            this.savingMeasurements = true;
            this.error = '';
            this.success = '';

            try {
                // Export measurements in GeoJSON format
                const geojson = exportMeasurements(
                    this.viewer,
                    this.entry.path,
                    this.coordinateSystem
                );

                if (!geojson.features || geojson.features.length === 0) {
                    this.error = 'No measurements to save';
                    this.savingMeasurements = false;
                    return;
                }

                // Save the file
                if (!this.measurementStorage) {
                    this.measurementStorage = new MeasurementStorage(this.dataset, this.entry);
                }

                await this.measurementStorage.save(geojson);

                this.hasSavedMeasurements = true;

                // Show success message
                this.success = `${geojson.features.length} measurement${geojson.features.length > 1 ? 's' : ''} saved successfully`;

                console.log('Measurements saved successfully');
            } catch (e) {
                console.error('Error saving measurements:', e);
                this.error = `Failed to save measurements: ${e.message}`;
            } finally {
                this.savingMeasurements = false;
            }
        },

        /**
         * Delete saved measurements
         */
        deleteSavedMeasurements: function() {
            if (!this.measurementStorage) {
                return;
            }

            // Open confirmation dialog
            this.deleteMeasurementsDialogOpen = true;
        },

        /**
         * Handle delete measurements dialog close
         */
        handleDeleteMeasurementsDialogClose: async function(result) {
            this.deleteMeasurementsDialogOpen = false;

            if (result !== 'confirm') {
                return;
            }

            try {
                await this.measurementStorage.delete();
                this.hasSavedMeasurements = false;
                this.success = 'Saved measurements deleted successfully';
            } catch (e) {
                console.error('Error deleting measurements:', e);
                this.error = `Failed to delete measurements: ${e.message}`;
            }
        },

        handleHistoryBack: function () {
            this.$router.push({ name: 'ViewDataset', params: { org: this.dataset.org, ds: this.dataset.ds } });
        },
    }
}
</script>

<style>
#potree {
    .ui.message {
        margin: 8px;
    }

    background: #030A03;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;

    .loading {
        color: #fefefe;
        font-size: 120%;
        margin: 8px;
        text-align: center;

        .circle.notch {
            height: 20px;
            width: 22px;
        }
    }

    #potree_quick_buttons {
        left: auto !important;
        right: 40px !important;
    }

    .potree-container {
        &.loading {
            visibility: hidden;
        }

        margin: 1px 50px 0 0;
        display: flex;
        width: 100%;
        height: 100%;
        background: rgb(79, 79, 79);
        background: -moz-radial-gradient(center, ellipse cover, rgba(79, 79, 79, 1) 0%, rgba(22, 22, 22, 1) 100%);
        background: -webkit-gradient(radial, center center, 0px, center center, 100%, color-stop(0%, rgba(79, 79, 79, 1)), color-stop(100%, rgba(22, 22, 22, 1)));
        background: -webkit-radial-gradient(center, ellipse cover, rgba(79, 79, 79, 1) 0%, rgba(22, 22, 22, 1) 100%);
        background: -o-radial-gradient(center, ellipse cover, rgba(79, 79, 79, 1) 0%, rgba(22, 22, 22, 1) 100%);
        background: -ms-radial-gradient(center, ellipse cover, rgba(79, 79, 79, 1) 0%, rgba(22, 22, 22, 1) 100%);
        background: radial-gradient(ellipse at center, rgba(79, 79, 79, 1) 0%, rgba(22, 22, 22, 1) 100%);
        position: relative;
        padding: 0;

        #potree_render_area {
            -webkit-transition: right .35s;
            transition: right .35s;
        }

        #potree_render_area>canvas {
            width: 100% !important;
            height: 100% !important;
        }
    }

    .dg {
        &.main {
            position: absolute;
            right: 0px;
        }

        .c {
            select {
                color: black;
            }
        }
    }


    /* Potree specific */
    #potree_map {
        position: absolute;
        left: 50px;
        top: 50px;
        width: 400px;
        height: 400px;
        display: none
    }

    #potree_menu {
        input {
            color: buttontext;
        }

        legend {
            display: initial !important;
            width: initial !important;
            padding: initial !important;
            margin-bottom: initial !important;
            font-size: inherit !important;
            line-height: initial !important;
            color: inherit !important;
            border: initial !important;
            border-bottom: initial !important;
        }

        #show_2d_profile {
            color: initial !important;
        }
    }

    #potree_map_header {
        position: absolute;
        width: 100%;
        height: 25px;
        top: 0px;
        background-color: rgba(0, 0, 0, 0.5);
        z-index: 1000;
        border-top-left-radius: 3px;
        border-top-right-radius: 3px;
    }

    #potree_map_content {
        position: absolute;
        z-index: 100;
        top: 25px;
        width: 100%;
        height: calc(100% - 25px);
        border: 2px solid rgba(0, 0, 0, 0.5);
        box-sizing: border-box;
    }

    #potree_sidebar_container {
        overflow-y: auto;
        overflow-x: hidden;
        background-color: #19282c;
        right: 0;

        a {
            color: #111;
        }

        #sidebar_root {
            width: 300px;

            .pv-menu-list {
                padding-right: 12px;

                .divider {
                    padding: 10px 0px 15px 0px;
                }

                a {
                    color: #8Aa1c4;
                }
            }

            .measurement-panel-remove:hover {
                cursor: pointer;
            }

            position: absolute;
            min-height: 100%;
            height: 100%;

            .potree_sidebar_brand {
                display: flex;
                flex-direction: row;
            }

            #potree_version_number {
                color: #9AA1A4;
                font-size: 80%;
                font-weight: 100;
            }
        }
    }

    #profile_window {
        z-index: 999999999999 !important;
    }

    /* Toolbar for measurements */
    .measurements-toolbar {
        position: absolute;
        top: 10px;
        left: 10px;
        z-index: 1000;
        background: rgba(0, 0, 0, 0.7);
        padding: 10px;
        border-radius: 5px;
        display: flex;
        gap: 10px;
        align-items: center;
    }

    .btn-measurement {
        background: #4a90e2;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 5px;
        font-size: 14px;
        transition: background 0.3s;
    }

    .btn-measurement:hover {
        background: #357abd;
    }

    .btn-measurement:disabled {
        background: #666;
        cursor: not-allowed;
    }

    .btn-measurement.btn-danger {
        background: #e74c3c;
    }

    .btn-measurement.btn-danger:hover {
        background: #c0392b;
    }
}
</style>