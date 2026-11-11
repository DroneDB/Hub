<template>
    <Window id="newFolder" title="Create folder" modal max-width="70%" fixed-size cancel-label="Cancel" confirm-label="Create" :busy="busy" @confirm="submitForm()" @close="onWindowClose">
        <Form ref="formRef" :resolver="resolver" :initial-values="{ name: '' }" @submit="submit(save, $event)">
            <template #default="$form">
                <PrimeMessage v-if="formError" severity="error" role="alert" class="mb-2 form-error">{{ formError }}</PrimeMessage>
                <label for="new-folder-name" class="d-block mb-1 fw-semibold">Folder name</label>
                <InputText id="new-folder-name" name="name" class="newFolderInput" aria-label="Folder name" placeholder="Folder name"
                           autocomplete="off" :readonly="busy"
                           :invalid="!!errorOf($form, 'name')"
                           :aria-invalid="errorOf($form, 'name') ? 'true' : undefined"
                           :aria-describedby="errorOf($form, 'name') ? 'new-folder-name-error' : undefined" />
                <!-- The refusal of the name, at the field: before the request for what the Hub knows, after it for what the Registry answers (409, FR-EXP-15) -->
                <FieldError id="new-folder-name-error" :message="errorOf($form, 'name')" />
            </template>
        </Form>
    </Window>
</template>

<script>
import Form from '@primevue/forms/form';
import Window from '@/components/HubWindow.vue';
import InputText from 'primevue/inputtext';
import PrimeMessage from 'primevue/message';
import FieldError from '@/components/FieldError.vue';
import { createResolver } from '@/libs/forms/resolver';
import { entryNameProblem } from '@/libs/nameRules';
import { useHubForm } from '@/composables/useHubForm';

/**
 * NewFolderDialog - the name of a new folder (FR-EXP-15, FR-EXP-05, D-034, D-046).
 *
 * The field is neutral when the dialog opens. A name that is blank, has a '/' (the dialog takes one
 * folder name, as Rename does; the API accepts nested paths) or that an entry of the folder already
 * has (letter case ignored, as the Registry compares, D-040) is refused at the field with
 * `entryNameProblem`, and no request is sent. The request runs in the dialog (`createFolder`): a refusal of
 * the Registry (a 409 for a name that exists) shows at the field and the dialog stays open with the
 * typed text; the dialog closes only when the folder exists.
 *
 * Props:
 *   createFolder - async (name) => the created entry; throws when the request fails
 *   siblings - the entries of the folder (paths or objects with a `path`), for the clash check
 *   folder   - dataset path of the folder ('' for the root)
 */
export default {
    components: { Window, InputText, Form, FieldError, PrimeMessage },

    props: {
        createFolder: { type: Function, required: true },
        siblings: { type: Array, default: () => [] },
        folder: { type: String, default: '' }
    },
    emits: ['close'],

    setup(props, { emit }) {
        const resolver = createResolver({
            name: value => entryNameProblem(value, props.siblings, { folder: props.folder, label: 'Folder' })
        });
        const form = useHubForm({ fields: ['name'], statusFields: { 409: 'name' } });

        // The folder is created from the trimmed name; the dialog closes with it when the request went through
        async function save(values) {
            const name = values.name.trim();
            const entry = await props.createFolder(name);
            emit('close', 'createFolder', name, entry);
        }

        return { ...form, resolver, save };
    },

    methods: {
        onWindowClose() {
            // Block close while a folder creation is in progress
            if (this.busy) return;
            this.$emit('close', 'close');
        }
    }
};
</script>

<style scoped>
.newFolderInput {
    width: 100%;
}
</style>
