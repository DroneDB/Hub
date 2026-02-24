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
            confirmButtonClass="negative"
            @onClose="$emit('clearMeasurementsClose', $event)">
        </ConfirmDialog>
        <ConfirmDialog v-if="deleteSavedMeasurementsDialogOpen"
            title="Delete Saved Measurements"
            message="Are you sure you want to delete saved measurements?"
            confirmText="Delete"
            cancelText="Cancel"
            confirmButtonClass="negative"
            @onClose="$emit('deleteSavedMeasurementsClose', $event)">
        </ConfirmDialog>
        <Flash v-if="flashMessage" :color="flashColor" :icon="flashIcon" @onClose="$emit('flashClose')">{{ flashMessage }}</Flash>
    </div>
</template>

<script>
import Alert from './Alert.vue';
import ConfirmDialog from './ConfirmDialog.vue';
import Flash from './Flash.vue';

export default {
    components: { Alert, ConfirmDialog, Flash },
    props: {
        alertDialogOpen: { type: Boolean, default: false },
        alertTitle: { type: String, default: '' },
        alertMessage: { type: String, default: '' },
        clearMeasurementsDialogOpen: { type: Boolean, default: false },
        deleteSavedMeasurementsDialogOpen: { type: Boolean, default: false },
        flashMessage: { type: String, default: null },
        flashColor: { type: String, default: 'positive' },
        flashIcon: { type: String, default: 'check circle outline' }
    }
};
</script>
