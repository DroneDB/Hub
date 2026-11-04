<template>
    <div>
        <Alert v-if="alertDialogOpen" :title="alertTitle" @close="$emit('alertClose')">
            {{ alertMessage }}
        </Alert>
        <ConfirmDialog v-if="clearMeasurementsDialogOpen"
                       title="Clear All Measurements"
                       message="Are you sure you want to clear all measurements?"
                       confirm-text="Clear"
                       cancel-text="Cancel"
                       confirm-button-class="danger"
                       @close="$emit('clearMeasurementsClose', $event)" />
        <DeleteSavedMeasurementsDialog v-if="deleteSavedMeasurementsDialogOpen"
                                       @close="$emit('deleteSavedMeasurementsClose', $event)" />
    </div>
</template>

<script>
import Alert from '@/components/HubAlert.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import DeleteSavedMeasurementsDialog from '@/components/measurements/DeleteSavedMeasurementsDialog.vue';

export default {
    components: { Alert, ConfirmDialog, DeleteSavedMeasurementsDialog },
    props: {
        alertDialogOpen: { type: Boolean, default: false },
        alertTitle: { type: String, default: '' },
        alertMessage: { type: String, default: '' },
        clearMeasurementsDialogOpen: { type: Boolean, default: false },
        deleteSavedMeasurementsDialogOpen: { type: Boolean, default: false }
    },
    emits: ['alertClose', 'clearMeasurementsClose', 'deleteSavedMeasurementsClose']
};
</script>
