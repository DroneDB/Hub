<template>
    <Window title="Rename" id="rename" @onClose="onWindowClose" @show="focusInput" modal maxWidth="70%" fixedSize>

        <InputText class="renameInput" ref="renameInput" @keyup.enter="rename" @keyup.esc="close('close')"
            v-model="renameText" :invalid="renameText == null || renameText.length == 0" :disabled="busy" fluid />

        <!-- Checkbox to also rename sidecar files (e.g. _measurements.geojson, _cameras.json) -->
        <div v-if="sidecars.length > 0" class="sidecar-rename-option">
            <div class="d-flex align-items-center gap-2 mb-2">
                <Checkbox
                    v-model="renameSidecars"
                    :binary="true"
                    :disabled="busy"
                    inputId="renameSidecarsCheckbox" />
                <label for="renameSidecarsCheckbox">
                    Also rename sidecar files
                </label>
            </div>
            <ul class="sidecar-list">
                <li v-for="sc in sidecars" :key="sc.path">{{ sc.label }}</li>
            </ul>
        </div>

        <div class="d-flex justify-content-end gap-2 mt-3 w-100">
            <Button @click="close('close')" :disabled="busy" severity="secondary" label="Close" />
            <Button @click="rename" :disabled="!renameText || renameText === file.label || busy" :loading="busy" severity="primary" label="Rename" />
        </div>
    </Window>
</template>

<script>
import Window from '@/components/Window.vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Checkbox from 'primevue/checkbox';
import ddb from 'ddb';
import { discoverSidecars } from '@/libs/sidecarUtils';

export default {
    components: {
        Window, Button, InputText, Checkbox
    },

    props: {
        file: { type: Object, required: true },
        busy: { type: Boolean, default: false },
        allEntries: { type: Array, default: () => [] }
    },
    emits: ['onClose'],

    data: function () {
        return {
            renameText: null,
            sidecars: [],
            renameSidecars: true  // Checked by default
        };
    },
    mounted: function () {
        this.renameText = this.file.label;

        // Initial best-effort focus; the authoritative focus happens on the
        // dialog's "show" event (focusInput), once the enter transition has
        // completed and PrimeVue's own focus handling can no longer steal it.
        this.focusInput();

        this.sidecars = discoverSidecars(this.allEntries, this.file.entry.path);
    },
    methods: {
        focusInput() {
            this.$nextTick(() => {
                const input = this.$refs.renameInput;
                if (!input || !input.$el) return;
                const inputEl = input.$el;
                inputEl.focus();
                inputEl.select();
                const dotIdx = this.renameText ? this.renameText.indexOf(".") : -1;
                if (dotIdx !== -1) {
                    inputEl.selectionEnd = dotIdx;
                }
            });
        },
        close: function (buttonId) {
            if (this.busy && buttonId !== 'rename' && buttonId !== 'renameddb') return;
            this.$emit('onClose', buttonId);
        },
        onWindowClose: function () {
            if (this.busy) return;
            this.close('close');
        },
        async rename() {
            if (this.busy) return;
            if (!this.renameText) return;

            // Check file type
            if (this.file.entry.type === ddb.entry.type.DRONEDB) {
                this.$emit('onClose', "renameddb", this.renameText, this.entry);
                return;
            }

            let basePath = this.file.entry.path.substring(0, this.file.entry.path.lastIndexOf('/'));

            // Check that renameText doesn't contain invalid characters
            if (this.renameText.indexOf('/') != -1 ||
                this.renameText.indexOf('\\') != -1 ||
                this.renameText.indexOf('..') != -1 ||
                this.renameText.indexOf('.') == 0) {

                this.$refs.renameInput.$el.setCustomValidity("Invalid characters in path");
                return;
            }

            const newPath = (basePath != null && basePath.length > 0)
                ? basePath + '/' + this.renameText
                : this.renameText;

            // If sidecar files were found and the checkbox is checked, rename them too
            if (this.renameSidecars && this.sidecars.length > 0) {
                const oldBase = this.file.entry.path.replace(/\.[^./\\]+$/, '');
                const newBase = newPath.replace(/\.[^./\\]+$/, '');

                const sidecarsInfo = this.sidecars.map(sc => ({
                    oldPath: sc.path,
                    newPath: newBase + sc.path.substring(oldBase.length)
                }));

                this.$emit('onClose', "rename", newPath, this.file.entry, { sidecars: sidecarsInfo });
                return;
            }

            // Normal emit for files without sidecars or with unchecked checkbox
            this.$emit('onClose', "rename", newPath, this.file.entry);
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
