<template>
    <Window id="setCrsDialog" title="Set Coordinate System" modal max-width="560px" fixed-size cancel-label="Close" confirm-label="Apply" confirm-icon="fa-solid fa-earth-europe" :busy="busy" @confirm="submitForm()" @close="$emit('close', 'close')">
        <div class="set-crs-dialog">
            <Form ref="formRef" :resolver="resolver" :initial-values="{ crs: initialCrs }" @submit="submit(apply, $event)">
                <template #default="$form">
                    <!-- What is wrong with no field of its own (the drawing is gone, the server is down) -->
                    <PrimeMessage v-if="formError" severity="error" role="alert" :closable="false" class="form-error">
                        {{ formError }}
                    </PrimeMessage>

                    <PrimeMessage severity="info" :closable="false">
                        <strong>Drawing:</strong> {{ drawingName }}<br>
                        <strong>Now:</strong> {{ currentCrs }}
                    </PrimeMessage>

                    <div class="my-3 d-flex flex-column gap-2">
                        <div class="d-flex align-items-center gap-2">
                            <RadioButton v-model="mode" input-id="crsModeSystem" value="system" :disabled="busy" />
                            <label for="crsModeSystem">Coordinate system</label>
                        </div>
                        <InputText name="crs" placeholder="EPSG:32632, or WKT" aria-label="Coordinate system (EPSG code or WKT)" autocomplete="off"
                                   :disabled="busy || mode !== 'system'"
                                   :invalid="!!shownError($form)" :aria-invalid="shownError($form) ? 'true' : undefined"
                                   :aria-describedby="shownError($form) ? 'set-crs-error' : 'set-crs-help'" fluid />
                        <!-- The form of the value is checked here before Apply; a value of the right form that the server refuses
                             (an EPSG code that does not exist, a WKT that does not parse) gets the server's error here too -->
                        <FieldError id="set-crs-error" :message="shownError($form)" />
                        <small v-if="!shownError($form)" id="set-crs-help" class="help-text">The coordinate system of the drawing's coordinates: an EPSG
                            code (a number is read as one) or a WKT definition.</small>

                        <div class="d-flex align-items-center gap-2 mt-2">
                            <RadioButton v-model="mode" input-id="crsModeLocal" value="local" :disabled="busy" />
                            <label for="crsModeLocal">Local drawing coordinates (not placed on the map)</label>
                        </div>
                    </div>

                    <small class="help-text d-block">Saved as <strong>{{ prjName }}</strong> next to the drawing, which
                        is then rebuilt. Delete that file to use the drawing's own coordinate system again.</small>
                </template>
            </Form>

        </div>
    </Window>
</template>

<script>
import { ref } from 'vue';
import Form from '@primevue/forms/form';
import Window from '@/components/HubWindow.vue';
import PrimeMessage from 'primevue/message';
import InputText from 'primevue/inputtext';
import RadioButton from 'primevue/radiobutton';
import FieldError from '@/components/FieldError.vue';
import { formatCadCrs } from '@/libs/propertiesUtils';
import { crsRequest, crsProblem } from '@/libs/cadCrs';
import { createResolver } from '@/libs/forms/resolver';
import { useHubForm } from '@/composables/useHubForm';
import ddb from 'ddb';

const { pathutils } = ddb;

export default {
    components: { Window, PrimeMessage, InputText, RadioButton, Form, FieldError },

    props: {
        file: { type: Object, required: true },
        dataset: { type: Object, required: true }
    },
    emits: ['close'],

    setup(props) {
        const crs = props.file.entry?.properties?.vector?.crs;
        const mode = ref(crs && crs.source === 'prj' && crs.label === 'local' ? 'local' : 'system');
        // The local choice has no value to check; the value of the system choice is checked in the form that is sent
        const resolver = createResolver(() => ({
            crs: value => (mode.value === 'local' ? null : crsProblem(crsRequest('system', value)))
        }));
        // A 400 of the server concerns the value, which is the one field (D-047, FR-XC-11)
        const form = useHubForm({ fields: ['crs'], statusFields: { 400: 'crs' } });
        return {
            ...form, resolver, mode,
            initialCrs: crs && /^EPSG:\d+$/.test(crs.label || '') ? crs.label : ''
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
            // The dialog is where the system is set: no pointer to it
            return formatCadCrs(this.file.entry, { forDialog: true }) || 'Unknown';
        }
    },

    methods: {
        // The error under the field: the form check is for the system choice only; a refusal of the server shows for either
        shownError($form) {
            return this.mode === 'system' ? this.errorOf($form, 'crs') : (this.serverErrors.crs || '');
        },
        async apply(values) {
            const entry = await this.dataset.setCadCrs(this.file.entry.path, crsRequest(this.mode, values.crs));
            this.$emit('close', 'set', { prjPath: entry && entry.path ? entry.path : this.prjName });
        }
    }
};
</script>

<style scoped>
.set-crs-dialog {
    min-width: min(380px, var(--window-content-width, 100%));
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
