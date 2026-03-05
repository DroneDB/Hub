<template>
    <Window title="Rename" id="rename" @onClose="close('close')" modal maxWidth="70%" fixedSize>

        <InputText class="renameInput" ref="renameInput" @keyup.enter="rename" @keyup.esc="close"
            v-model="renameText" :invalid="renameText == null || renameText.length == 0" fluid />

        <!-- Checkbox to also rename the measurements file -->
        <div v-if="hasMeasurementsFile" class="measurements-rename-option">
            <div class="d-flex align-items-center gap-2 mb-2">
                <Checkbox
                    v-model="renameMeasurements"
                    :binary="true"
                    inputId="renameMeasurementsCheckbox" />
                <label for="renameMeasurementsCheckbox">
                    Also rename associated measurements file
                </label>
            </div>
            <div class="hint">
                <i class="fa-solid fa-circle-info"></i>
                A measurements file was found for this point cloud
            </div>
        </div>

        <div class="d-flex justify-content-end gap-2 mt-3 w-100">
            <Button @click="close('close')" severity="secondary" label="Close" />
            <Button @click="rename" :disabled="!renameText || renameText === file.label" severity="primary" label="Rename" />
        </div>
    </Window>
</template>

<script>
import Window from './Window.vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Checkbox from 'primevue/checkbox';
import ddb from 'ddb';
import { MeasurementStorage } from '../libs/measurementStorage';

export default {
    components: {
        Window, Button, InputText, Checkbox
    },

    props: ["file"],
    emits: ['onClose'],

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
            const inputEl = this.$refs.renameInput.$el;
            inputEl.focus();
            inputEl.select();
            const dotIdx = this.renameText.indexOf(".");
            if (dotIdx !== -1) {
                inputEl.selectionEnd = dotIdx;
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

                this.$refs.renameInput.$el.setCustomValidity("Invalid characters in path");
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
    margin-top: 0.5rem;
    width: 100%;
}

.measurements-rename-option {
    margin-top: 1rem;
    padding: 0.75rem;
    background: rgba(var(--ddb-primary-rgb), 0.1);
    border-radius: 0.25rem;
    border-left: 3px solid var(--ddb-primary);
}

.measurements-rename-option label {
    color: var(--ddb-text);
    font-weight: 500;
}

.measurements-rename-option .hint {
    font-size: 0.75rem;
    color: var(--ddb-text-muted);
    margin-top: 0.25rem;
    display: flex;
    align-items: center;
    gap: 0.25rem;
}

.measurements-rename-option .hint i {
    font-size: 0.875rem;
}
</style>
