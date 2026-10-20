<template>
    <div>
        <Alert v-if="alertDialogOpen" :title="alertTitle" @on-close="$emit('alertClose')">
            {{ alertMessage }}
        </Alert>
        <ConfirmDialog v-if="clearMeasurementsDialogOpen"
                       title="Clear All Measurements"
                       message="Are you sure you want to clear all measurements?"
                       confirm-text="Clear"
                       cancel-text="Cancel"
                       confirm-button-class="danger"
                       @on-close="$emit('clearMeasurementsClose', $event)" />
        <ConfirmDialog v-if="deleteSavedMeasurementsDialogOpen"
                       title="Delete Saved Measurements"
                       message="Are you sure you want to delete saved measurements?"
                       confirm-text="Delete"
                       cancel-text="Cancel"
                       confirm-button-class="danger"
                       @on-close="$emit('deleteSavedMeasurementsClose', $event)" />
    </div>
</template>

<script>
import Alert from '@/components/Alert.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';

export default {
    components: { Alert, ConfirmDialog },
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
