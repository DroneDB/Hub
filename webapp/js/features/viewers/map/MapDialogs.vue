<template>
    <div>
        <Alert :title="alertTitle" v-if="alertDialogOpen" @onClose="$emit('alertClose')">
            {{ alertMessage }}
        </Alert>
        <ConfirmDialog v-if="clearMeasurementsDialogOpen"
            title="Clear All Measurements"
            message="Are you sure you want to clear all measurements?"
            confirmText="Clear"
            cancelText="Cancel"
            confirmButtonClass="danger"
            @onClose="$emit('clearMeasurementsClose', $event)">
        </ConfirmDialog>
        <ConfirmDialog v-if="deleteSavedMeasurementsDialogOpen"
            title="Delete Saved Measurements"
            message="Are you sure you want to delete saved measurements?"
            confirmText="Delete"
            cancelText="Cancel"
            confirmButtonClass="danger"
            @onClose="$emit('deleteSavedMeasurementsClose', $event)">
        </ConfirmDialog>
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
    }
};
</script>
