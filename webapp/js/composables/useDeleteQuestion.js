// @ts-check
/**
 * useDeleteQuestion - a delete that asks first, in a component that shows the question in its own template. A dialog
 * opened on the dialog registry has no registry of its own to open the question on, so it renders it inline:
 *
 *   setup() { const { deleteQuestion, askDelete, answerDelete } = useDeleteQuestion(); return { ... }; }
 *   askDelete(measurementDeleteQuestion([item]), () => this.$emit('delete'));
 *   <ConfirmDialog v-if="deleteQuestion" v-bind="deleteQuestion" @close="answerDelete" />
 *
 * The question takes its text from libs/deleteConfirmation (Delete / Cancel, a danger dialog); the delete runs only on
 * Delete, and Cancel, Esc or the close button leave everything as it was.
 */
import { shallowRef } from 'vue';
import { confirmDialogProps } from '@/libs/deleteConfirmation';

export function useDeleteQuestion() {
    /** @type {import('vue').ShallowRef<ReturnType<typeof confirmDialogProps> | null>} */
    const deleteQuestion = shallowRef(null);
    /** @type {(() => void) | null} */
    let onConfirm = null;

    /**
     * @param {Parameters<typeof confirmDialogProps>[0]} options  what is deleted (libs/deleteConfirmation)
     * @param {() => void} confirmed  the delete, run once the user chose Delete
     */
    function askDelete(options, confirmed) {
        deleteQuestion.value = confirmDialogProps(options);
        onConfirm = confirmed;
    }

    /** @param {string} result  the ConfirmDialog's answer: 'confirm' or 'cancel' */
    function answerDelete(result) {
        const run = onConfirm;
        deleteQuestion.value = null;
        onConfirm = null;
        if (result === 'confirm' && run) run();
    }

    return { deleteQuestion, askDelete, answerDelete };
}
