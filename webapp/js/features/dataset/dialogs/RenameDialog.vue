<template>
    <Window id="rename" :title="title" modal max-width="70%" fixed-size cancel-label="Cancel" confirm-label="Rename" :confirm-disabled="unchanged" :busy="busy" @confirm="submitForm()" @close="onWindowClose" @show="selectName">

        <Form ref="formRef" :resolver="resolver" :initial-values="{ name: file.label }" @submit="submit(save, $event)">
            <template #default="$form">
                <PrimeMessage v-if="formError" severity="error" role="alert" class="mb-2 form-error">{{ formError }}</PrimeMessage>
                <InputText id="rename-name" name="name" class="renameInput" aria-label="New name" autocomplete="off" :readonly="busy"
                           :invalid="!!errorOf($form, 'name')"
                           :aria-invalid="errorOf($form, 'name') ? 'true' : undefined"
                           :aria-describedby="errorOf($form, 'name') ? 'rename-name-error' : undefined" fluid />
                <!-- A name that exists is refused here before the request, and a 409 of the Registry shows here too (FR-EXP-04) -->
                <FieldError id="rename-name-error" :message="errorOf($form, 'name')" />
            </template>
        </Form>

        <!-- Checkbox to also rename sidecar files (e.g. _measurements.geojson, _cameras.json) -->
        <div v-if="sidecars.length > 0" class="sidecar-rename-option">
            <div class="d-flex align-items-center gap-2 mb-2">
                <Checkbox
                    v-model="renameSidecars"
                    :binary="true"
                    :disabled="busy"
                    input-id="renameSidecarsCheckbox" />
                <label for="renameSidecarsCheckbox">
                    Also rename sidecar files
                </label>
            </div>
            <ul class="sidecar-list">
                <li v-for="sc in sidecars" :key="sc.path">{{ sc.label }}</li>
            </ul>
        </div>

    </Window>
</template>

<script>
import Form from '@primevue/forms/form';
import Window from '@/components/HubWindow.vue';
import InputText from 'primevue/inputtext';
import Checkbox from 'primevue/checkbox';
import PrimeMessage from 'primevue/message';
import FieldError from '@/components/FieldError.vue';
import ddb from 'ddb';
import { discoverSidecars } from '@/libs/sidecarUtils';
import { createResolver } from '@/libs/forms/resolver';
import { entryNameProblem, displayNameLengthProblem } from '@/libs/nameRules';
import { useHubForm } from '@/composables/useHubForm';

/**
 * RenameDialog - the new name of an entry (FR-EXP-04, D-046).
 *
 * The name is checked at the field with `entryNameProblem` (the published entry name rule, and a
 * sibling that has the name, letter case ignored as the Registry compares, D-040) and a refusal
 * sends no request. The request runs in the dialog (`renameEntry`): a refusal of the Registry (a
 * 409 for a name that exists) shows at the field, and the dialog stays open. The dataset root is
 * a dataset: its new name is made a slug by the page (`renameDataset`), in the dialog too, so a slug
 * that is taken shows at the field (the Registry names it `slug`: the slug is made of this name).
 *
 * Props:
 *   file        - the item to rename
 *   allEntries  - the items of the listing (the sidecars are found in them)
 *   siblings    - the dataset paths of the entries of the listing, for the clash check
 *   renameEntry - async (newPath, { sidecars }) => ...; throws when the rename fails
 *   renameDataset - async (name) => ...; the rename of the dataset root; throws when it fails
 */
export default {
    components: {
        Window, InputText, Checkbox, Form, FieldError, PrimeMessage
    },

    props: {
        file: { type: Object, required: true },
        allEntries: { type: Array, default: () => [] },
        siblings: { type: Array, default: () => [] },
        renameEntry: { type: Function, default: null },
        renameDataset: { type: Function, default: null }
    },
    emits: ['close'],

    setup(props) {
        const isDatasetRoot = props.file.entry?.type === ddb.entry.type.DRONEDB;
        const label = ddb.entry.isDirectory(props.file.entry) ? 'Folder' : 'File';
        const resolver = createResolver({
            name: value => isDatasetRoot
                // The dataset root keeps its slug when the name makes none, so a rename is never refused for the Latin letter rule (D-035)
                ? ((value ?? '').trim() === '' ? 'Enter a name' : displayNameLengthProblem(value))
                : entryNameProblem(value, props.siblings, { selfPath: props.file.entry?.path, label })
        });
        // The dataset root: the slug the Registry refuses is the one made of the name
        const form = useHubForm({ fields: ['name'], aliases: isDatasetRoot ? { slug: 'name' } : {}, statusFields: { 409: 'name' } });

        // `sidecars` and its checkbox are not fields of the form: they only change what the rename moves
        const sidecars = props.file.entry?.path ? discoverSidecars(props.allEntries, props.file.entry.path) : [];

        return { ...form, resolver, isDatasetRoot, sidecars };
    },

    data: function () {
        return {
            renameSidecars: true  // Checked by default
        };
    },
    computed: {
        // Names the item renamed (the toolbar acts on the selection of the moment)
        title: function () {
            const name = this.file.label || ddb.pathutils.basename(this.file.entry?.path || '');
            return name ? `Rename "${name}"` : 'Rename';
        },
        // A form with no change is the one disabled submit (D-046)
        unchanged: function () {
            const typed = this.formRef?.states?.name?.value;
            return typeof typed !== 'string' || typed.trim() === this.file.label;
        }
    },
    methods: {
        // The name is selected up to its extension, once the enter transition has completed and PrimeVue's own focus
        // handling can no longer steal the focus
        selectName() {
            this.$nextTick(() => {
                const input = document.getElementById('rename-name');
                if (!input) return;
                input.focus();
                input.select();
                const dotIdx = input.value ? input.value.indexOf('.') : -1;
                if (dotIdx > 0) input.selectionEnd = dotIdx;
            });
        },
        onWindowClose: function () {
            if (this.busy) return;
            this.$emit('close', 'close');
        },
        async save(values) {
            const name = values.name.trim();

            // The dataset root is renamed by the page (its name makes the new slug); a failure is thrown as for an entry
            if (this.isDatasetRoot) {
                await this.renameDataset(name);
                this.$emit('close', 'renameddb', name, this.file.entry);
                return;
            }

            const basePath = ddb.pathutils.getParentFolder(this.file.entry.path) || '';
            const newPath = basePath.length > 0 ? basePath + '/' + name : name;

            // If sidecar files were found and the checkbox is checked, rename them too
            let sidecarsInfo = [];
            if (this.renameSidecars && this.sidecars.length > 0) {
                const oldBase = this.file.entry.path.replace(/\.[^./\\]+$/, '');
                const newBase = newPath.replace(/\.[^./\\]+$/, '');

                sidecarsInfo = this.sidecars.map(sc => ({
                    oldPath: sc.path,
                    newPath: newBase + sc.path.substring(oldBase.length)
                }));
            }

            // A failure is thrown: the form shows it at the field and the dialog stays open
            await this.renameEntry(newPath, { sidecars: sidecarsInfo });
            this.$emit('close', 'rename', newPath, this.file.entry);
        }
    }
}
</script>

<style scoped>
.renameInput {
    margin-top: 0.5rem;
    width: 100%;
}

.sidecar-rename-option {
    margin-top: var(--ddb-spacing-lg);
    padding: var(--ddb-spacing-md);
    background: rgba(var(--ddb-primary-rgb), 0.1);
    border-radius: var(--ddb-radius-sm);
    border-left: 0.25rem solid var(--ddb-primary);
}

.sidecar-rename-option label {
    color: var(--ddb-text);
    font-weight: 500;
}

.sidecar-list {
    margin: 0;
    padding-left: 1.25rem;
    font-size: 0.75rem;
    color: var(--ddb-text-muted);
    list-style: disc;
}

.sidecar-list li {
    margin-bottom: 0.15rem;
}
</style>
