<template>
    <Window title="Set Coordinate System" id="setCrsDialog" @onClose="close('close')" modal maxWidth="560px" fixedSize>
        <div class="set-crs-dialog">
            <form v-on:submit.prevent="apply">
                <PrimeMessage v-if="errorMessage" severity="error" :closable="false">
                    {{ errorMessage }}
                </PrimeMessage>

                <PrimeMessage severity="info" :closable="false">
                    <strong>Drawing:</strong> {{ drawingName }}<br />
                    <strong>Now:</strong> {{ currentCrs }}
                </PrimeMessage>

                <div class="my-3 d-flex flex-column gap-2">
                    <div class="d-flex align-items-center gap-2">
                        <RadioButton v-model="mode" inputId="crsModeSystem" value="system" :disabled="saving" />
                        <label for="crsModeSystem">Coordinate system</label>
                    </div>
                    <InputText v-model="crs" placeholder="EPSG:32632, or WKT" :disabled="saving || mode !== 'system'"
                        :invalid="mode === 'system' && !!crsError" fluid />
                    <small v-if="mode === 'system' && crsError" class="crs-error">{{ crsError }}</small>
                    <small v-else class="help-text">The coordinate system of the drawing's coordinates: an EPSG
                        code (a number is read as one) or a WKT definition.</small>

                    <div class="d-flex align-items-center gap-2 mt-2">
                        <RadioButton v-model="mode" inputId="crsModeLocal" value="local" :disabled="saving" />
                        <label for="crsModeLocal">Local drawing coordinates (not placed on the map)</label>
                    </div>
                </div>

                <small class="help-text d-block">Saved as <strong>{{ prjName }}</strong> next to the drawing, which
                    is then rebuilt. Delete that file to use the drawing's own coordinate system again.</small>
            </form>

            <div class="d-flex justify-content-end gap-2 mt-3 w-100">
                <Button @click="close('close')" severity="secondary" :disabled="saving" label="Close" />
                <Button @click="apply" :disabled="saving || !canApply" :loading="saving" severity="primary"
                    icon="fa-solid fa-earth-europe" label="Apply" />
            </div>
        </div>
    </Window>
</template>

<script>
import Window from '@/components/Window.vue';
import Button from 'primevue/button';
import PrimeMessage from 'primevue/message';
import InputText from 'primevue/inputtext';
import RadioButton from 'primevue/radiobutton';
import { formatCadCrs } from '@/libs/propertiesUtils';
import { crsRequest } from '@/libs/cadCrs';
import ddb from 'ddb';

const { pathutils } = ddb;

export default {
    components: { Window, Button, PrimeMessage, InputText, RadioButton },

    props: {
        file: { type: Object, required: true },
        dataset: { type: Object, required: true }
    },
    emits: ['onClose'],

    data() {
        const crs = this.file.entry?.properties?.vector?.crs;
        return {
            mode: crs && crs.source === 'prj' && crs.label === 'local' ? 'local' : 'system',
            crs: crs && /^EPSG:\d+$/.test(crs.label || '') ? crs.label : '',
            saving: false,
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
            this.$emit('onClose', action, result);
        }
    }
};
</script>

<style scoped>
.set-crs-dialog {
    min-width: 380px;
}

.crs-error {
    color: var(--p-red-500, #e24c4c);
    font-size: 0.8rem;
}

.help-text {
    color: var(--p-text-muted-color, #888);
    font-size: 0.8rem;
}
</style>
