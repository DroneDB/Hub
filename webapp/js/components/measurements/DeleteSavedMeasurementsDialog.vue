<template>
    <ConfirmDialog title="Delete Saved Measurements"
                   message="Delete the saved measurements of this view? They are removed from the file and from the view."
                   confirm-text="Delete"
                   cancel-text="Cancel"
                   confirm-button-class="danger"
                   warning-message="This action cannot be undone."
                   @close="$emit('close', $event)" />
</template>

<script>
/**
 * The confirmation of Delete saved, the same on the 2D map and in the 3D viewer: the view's
 * measurements leave the file and the view (the other view's measurements in the file stay).
 */
import ConfirmDialog from '@/components/ConfirmDialog.vue';

export default {
    components: { ConfirmDialog },
    emits: ['close']
};
</script>
