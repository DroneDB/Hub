<template>
    <Window title="Rename" id="rename" @onClose="close('close')" modal maxWidth="70%" fixedSize>

        <input class="renameInput" ref="renameInput" v-on:keyup.enter="rename" v-on:keyup.esc="close"
            v-model="renameText" :error="renameText == null || renameText.length == 0" />

        <!-- Checkbox to also rename the measurements file -->
        <div v-if="hasMeasurementsFile" class="measurements-rename-option">
            <div class="ui checkbox">
                <input
                    type="checkbox"
                    id="renameMeasurementsCheckbox"
                    v-model="renameMeasurements">
                <label for="renameMeasurementsCheckbox">
                    Also rename associated measurements file
                </label>
            </div>
            <div class="hint">
                <i class="info circle icon"></i>
                A measurements file was found for this point cloud
            </div>
        </div>

        <div class="buttons">
            <button @click="close('close')" class="ui button">
                Close
            </button>
            <button @click="rename" :disabled="!renameText" class="ui button positive">
                Rename
            </button>
        </div>
    </Window>
</template>

<script>
import Window from './Window.vue';
import ddb from 'ddb';
import { MeasurementStorage } from '../libs/measurementStorage';

export default {
    components: {
        Window
    },

    props: ["file"],

    data: function () {
        return {
            renameText: null,
            hasMeasurementsFile: false,
            renameMeasurements: true,  // Checked by default
            checkingMeasurements: false
        };
    },
    mounted: function () {
        this.renameText = this.file.label;

        this.$nextTick(() => {
            this.$refs.renameInput.focus();

            this.$refs.renameInput.select();
            const dotIdx = this.renameText.indexOf(".");
            if (dotIdx !== -1) {
                this.$refs.renameInput.selectionEnd = dotIdx;
            }
        });

        // Check if measurements file exists
        this.checkForMeasurementsFile();
    },
    methods: {
        async checkForMeasurementsFile() {
            // Check only for point clouds
            if (this.file.entry.type !== ddb.entry.type.POINTCLOUD) {
                this.hasMeasurementsFile = false;
                return;
            }

            this.checkingMeasurements = true;

            try {
                // Use dataset from parent to create MeasurementStorage
                const dataset = this.$parent.dataset || this.$root.dataset;
                if (!dataset) {
                    console.warn('Dataset not available for measurements check');
                    this.hasMeasurementsFile = false;
                    return;
                }

                const storage = new MeasurementStorage(dataset, this.file.entry);
                this.hasMeasurementsFile = await storage.exists();

                if (this.hasMeasurementsFile) {
                    console.log('Measurements file found:', storage.measurementPath);
                }
            } catch (e) {
                console.error('Error checking for measurements file:', e);
                this.hasMeasurementsFile = false;
            } finally {
                this.checkingMeasurements = false;
            }
        },
        close: function (buttonId) {
            this.$emit('onClose', buttonId);
        },
        async rename() {
            if (!this.renameText) return;

            // Check file type
            if (this.file.entry.type === ddb.entry.type.DRONEDB) {
                this.$emit('onClose', "renameddb", this.renameText, this.entry);
                return;
            }

            let basePath = this.file.entry.path.substring(0, this.file.entry.path.lastIndexOf('/'));

            // Check that renameText doesn't contain invalid characters
            if (this.renameText.indexOf('/') != -1 ||
                this.renameText.indexOf('\\') != -1 ||
                this.renameText.indexOf('..') != -1 ||
                this.renameText.indexOf('.') == 0) {

                this.$refs.renameInput.setCustomValidity("Invalid characters in path");
                return;
            }

            const newPath = (basePath != null && basePath.length > 0)
                ? basePath + '/' + this.renameText
                : this.renameText;

            // If it's a point cloud with measurements, handle rename for that too
            if (this.file.entry.type === ddb.entry.type.POINTCLOUD &&
                this.hasMeasurementsFile &&
                this.renameMeasurements) {

                try {
                    // Calculate the new path for the measurements file
                    const dataset = this.$parent.dataset || this.$root.dataset;
                    if (dataset) {
                        const oldStorage = new MeasurementStorage(dataset, this.file.entry);
                        const oldMeasurementsPath = oldStorage.measurementPath;

                        // Calculate new measurements path based on new name
                        const newPathWithoutExt = newPath.substring(0, newPath.lastIndexOf('.'));
                        const newMeasurementsPath = `${newPathWithoutExt}_measurements.geojson`;

                        console.log(`Will rename measurements: ${oldMeasurementsPath} -> ${newMeasurementsPath}`);

                        // Emit event with both paths
                        this.$emit('onClose', "rename", newPath, this.file.entry, {
                            renameMeasurements: true,
                            oldMeasurementsPath: oldMeasurementsPath,
                            newMeasurementsPath: newMeasurementsPath
                        });
                        return;
                    }
                } catch (e) {
                    console.error('Error preparing measurements rename:', e);
                    // Continue anyway with normal rename
                }
            }

            // Normal emit for files without measurements or with unchecked checkbox
            this.$emit('onClose', "rename", newPath, this.file.entry);
        }
    }
}
</script>

<style scoped>
.renameInput {
    margin-top: 8px;
    width: 100%;
}

.measurements-rename-option {
    margin-top: 16px;
    padding: 12px;
    background: rgba(33, 133, 208, 0.1);
    border-radius: 4px;
    border-left: 3px solid #2185d0;
}

.measurements-rename-option .ui.checkbox {
    display: block;
    margin-bottom: 8px;
}

.measurements-rename-option .ui.checkbox label {
    color: #2c3e50;
    font-weight: 500;
}

.measurements-rename-option .hint {
    font-size: 12px;
    color: #7f8c8d;
    margin-top: 4px;
    display: flex;
    align-items: center;
    gap: 4px;
}

.measurements-rename-option .hint i {
    font-size: 14px;
}

.buttons {
    margin-top: 16px;
    text-align: right;
}
</style>
