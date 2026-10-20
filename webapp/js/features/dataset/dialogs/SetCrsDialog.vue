<template>
    <Window id="setCrsDialog" title="Set Coordinate System" modal max-width="560px" fixed-size cancel-label="Close" confirm-label="Apply" confirm-icon="fa-solid fa-earth-europe" :confirm-disabled="!canApply" :busy="saving" @confirm="apply" @close="close('close')">
        <div class="set-crs-dialog">
            <form @submit.prevent>
                <PrimeMessage v-if="errorMessage" severity="error" :closable="false">
                    {{ errorMessage }}
                </PrimeMessage>

                <PrimeMessage severity="info" :closable="false">
                    <strong>Drawing:</strong> {{ drawingName }}<br>
                    <strong>Now:</strong> {{ currentCrs }}
                </PrimeMessage>

                <div class="my-3 d-flex flex-column gap-2">
                    <div class="d-flex align-items-center gap-2">
                        <RadioButton v-model="mode" input-id="crsModeSystem" value="system" :disabled="saving" />
                        <label for="crsModeSystem">Coordinate system</label>
                    </div>
                    <InputText v-model="crs" placeholder="EPSG:32632, or WKT" aria-label="Coordinate system (EPSG code or WKT)" :disabled="saving || mode !== 'system'"
                               :invalid="showCrsError" fluid @input="touched = true" />
                    <small v-if="showCrsError" class="crs-error">{{ crsError }}</small>
                    <small v-else class="help-text">The coordinate system of the drawing's coordinates: an EPSG
                        code (a number is read as one) or a WKT definition.</small>

                    <div class="d-flex align-items-center gap-2 mt-2">
                        <RadioButton v-model="mode" input-id="crsModeLocal" value="local" :disabled="saving" />
                        <label for="crsModeLocal">Local drawing coordinates (not placed on the map)</label>
                    </div>
                </div>

                <small class="help-text d-block">Saved as <strong>{{ prjName }}</strong> next to the drawing, which
                    is then rebuilt. Delete that file to use the drawing's own coordinate system again.</small>
            </form>

        </div>
    </Window>
</template>

<script>
import Window from '@/components/Window.vue';
import PrimeMessage from 'primevue/message';
import InputText from 'primevue/inputtext';
import RadioButton from 'primevue/radiobutton';
import { formatCadCrs } from '@/libs/propertiesUtils';
import { crsRequest } from '@/libs/cadCrs';
import ddb from 'ddb';

const { pathutils } = ddb;

export default {
    components: { Window, PrimeMessage, InputText, RadioButton },

    props: {
        file: { type: Object, required: true },
        dataset: { type: Object, required: true }
    },
    emits: ['close'],

    data() {
        const crs = this.file.entry?.properties?.vector?.crs;
        return {
            mode: crs && crs.source === 'prj' && crs.label === 'local' ? 'local' : 'system',
            crs: crs && /^EPSG:\d+$/.test(crs.label || '') ? crs.label : '',
            saving: false,
            touched: false,
            errorMessage: null
        };
    },

    computed: {
        drawingName() {
            return pathutils.basename(this.file.entry.path);
        },
        prjName() {
            return this.drawingName.replace(/\.[^.]+$/, '') + '.prj';
        },
        currentCrs() {
            return formatCadCrs(this.file.entry) || 'Unknown';
        },
        crsError() {
            return crsRequest(this.mode, this.crs).length === 0 ? 'Enter a coordinate system.' : null;
        },
        // Only once the user has typed: an empty field is not an error yet
        showCrsError() {
            return this.mode === 'system' && this.touched && !!this.crsError;
        },
        canApply() {
            return this.mode === 'local' || !this.crsError;
        }
    },

    methods: {
        async apply() {
            if (!this.canApply || this.saving) return;
            this.saving = true;
            this.errorMessage = null;
            try {
                const entry = await this.dataset.setCadCrs(this.file.entry.path, crsRequest(this.mode, this.crs));
                this.close('set', { prjPath: entry && entry.path ? entry.path : this.prjName });
            } catch (e) {
                this.errorMessage = (e && e.message) ? e.message : String(e);
            } finally {
                this.saving = false;
            }
        },

        close(action, result) {
            this.$emit('close', action, result);
        }
    }
};
</script>

<style scoped>
.set-crs-dialog {
    min-width: 380px;
}

.crs-error {
    color: var(--p-red-500);
    font-size: 0.8rem;
}

.help-text {
    color: var(--p-text-muted-color);
    font-size: 0.8rem;
}
</style>
