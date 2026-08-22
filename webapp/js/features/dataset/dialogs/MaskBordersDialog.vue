<template>
    <Window title="Mask Borders" id="mask-borders-dialog" @onClose="close('cancel')" modal width="600px" height="auto" fixedPosition>
        <div class="mask-borders-dialog">
            <!-- Explanation -->
            <PrimeMessage severity="info" :closable="false" icon="fa-solid fa-circle-info" class="mb-3">
                <div>
                    Makes the black or white border pixels of the GeoTIFF transparent, producing a clean
                    orthomosaic without empty areas around the survey footprint. <br />The masked result is
                    added to the dataset as a <em>new</em> COG file with the <i>_masked</i> suffix, the original file is never modified.<br />
                    See the <a href="https://docs.dronedb.app/docs/features/georaster-processing#border-masking"
                        target="_blank" rel="noopener">Border Masking documentation</a> for details.
                </div>
            </PrimeMessage>

            <!-- Source (read-only) -->
            <div class="section">
                <label class="section-label">Source file</label>
                <InputText :modelValue="entry.entry.path" readonly fluid class="w-100" />
            </div>

            <!-- Actions -->
            <div class="actions">
                <Button label="Cancel" severity="secondary" @click="close('cancel')" />
                <Button label="Mask Borders" icon="fa-solid fa-eraser" severity="primary" @click="close('confirm')" />
            </div>
        </div>
    </Window>
</template>

<script>
import Window from '@/components/Window.vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import PrimeMessage from 'primevue/message';

/**
 * MaskBordersDialog - Confirmation dialog shown before starting the Mask Borders
 * operation on a single GeoTIFF.
 *
 * Explains what the operation does, links to the Border Masking documentation,
 * and emits 'onClose' with 'confirm' or 'cancel'. The actual check/existence
 * and job start are handled by the parent after confirmation.
 *
 * Props:
 *   entry - The selected file browser entry (single GeoRaster).
 */
export default {
    name: 'MaskBordersDialog',
    components: { Window, Button, InputText, PrimeMessage },

    props: {
        entry: { type: Object, required: true }
    },
    emits: ['onClose'],

    methods: {
        close(action) {
            this.$emit('onClose', action);
        }
    }
};
</script>

<style scoped>
.mask-borders-dialog {
    min-width: 380px;
    display: flex;
    flex-direction: column;
    gap: 0;
}

.mb-3 { margin-bottom: 0.75rem; }

.mb-3 :deep(a) {
    color: var(--p-blue-600);
}

.section {
    margin-bottom: 0.75rem;
}

.section-label {
    display: block;
    font-weight: 600;
    margin-bottom: 0.35rem;
    font-size: 0.85rem;
}

.w-100 { width: 100%; }

.actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1rem;
}
</style>
