<template>
    <ConfirmDialog v-bind="question" @close="$emit('close', $event)" />
</template>

<script>
/**
 * The confirmation of Delete saved, the same on the 2D map and in the 3D viewer: the view's
 * measurements leave the file and the view (the other view's measurements in the file stay).
 */
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import { confirmDialogProps } from '@/libs/deleteConfirmation';

export default {
    components: { ConfirmDialog },
    emits: ['close'],
    setup() {
        return {
            question: confirmDialogProps({
                kind: 'saved measurements',
                description: 'the saved measurements of this view: they leave the file and the view'
            })
        };
    }
};
</script>
