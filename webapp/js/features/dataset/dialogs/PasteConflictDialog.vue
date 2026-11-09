<template>
    <Window id="paste-conflict" :title="title" modal size-class="dialog-md" fixed-size @close="cancel">
        <div class="paste-conflict-content">
            <template v-if="!keepBoth">
                <p>
                    <strong>{{ items.length }}</strong> {{ word('file') }} in the destination folder
                    {{ word('has', 'have') }} the same {{ word('name') }} as {{ word('an item', 'items') }} being {{ participle }}.
                    How would you like to proceed?
                </p>
                <ul class="file-list">
                    <li v-for="it in items" :key="it.path" class="file-item">
                        <i class="fa-solid fa-triangle-exclamation amber" />
                        <span class="file-path">{{ basename(it.path) }}</span>
                    </li>
                </ul>
            </template>
            <template v-else-if="current">
                <p class="conflict-question">
                    A file or folder named <strong>{{ basename(current.path) }}</strong> already exists in
                    <template v-if="folderOf(current.path)">the folder <strong>{{ folderOf(current.path) }}</strong></template>
                    <template v-else>this folder</template>.
                    Replace it, keep both (the file being {{ participle }} gets a new name), or skip the file?
                </p>
                <p v-if="items.length > 1" class="conflict-count">Conflict {{ index + 1 }} of {{ items.length }}</p>
                <div v-if="remaining > 1" class="apply-all">
                    <Checkbox v-model="applyToAll" input-id="conflict-apply-all" :binary="true" />
                    <label for="conflict-apply-all">Apply to all {{ remaining }} conflicts</label>
                </div>
            </template>
        </div>

        <template #footer>
            <template v-if="!keepBoth">
                <Button severity="secondary" label="Cancel" @click="cancel" />
                <Button label="Skip All" icon="fa-solid fa-forward" @click="choose('skip')" />
                <Button severity="danger" label="Overwrite All" icon="fa-solid fa-pen-to-square" @click="choose('overwrite')" />
            </template>
            <template v-else>
                <Button severity="secondary" label="Cancel" @click="cancel" />
                <Button class="conflict-skip" label="Skip" icon="fa-solid fa-forward" @click="decide('skip')" />
                <Button class="conflict-keep" label="Keep both" icon="fa-solid fa-clone" @click="decide('keep')" />
                <Button class="conflict-replace" severity="danger" label="Replace" icon="fa-solid fa-pen-to-square" @click="decide('replace')" />
            </template>
        </template>
    </Window>
</template>

<script>
import Window from '@/components/HubWindow.vue';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import ddb from 'ddb';
import { pluralize } from '@/libs/format';
const { pathutils } = ddb;

const PARTICIPLES = { paste: 'pasted', upload: 'uploaded' };

/**
 * The prompt for names that exist in the destination folder (FR-UPL-03, FR-XC-07).
 *
 * Paste (the default): one choice for every file, `resolve` with 'overwrite', 'skip' or 'cancel'.
 * With `keepBoth` (uploads): the files one at a time, each with Replace, Keep both or Skip, and
 * "Apply to all" for the rest; `resolve` with one choice per item ('replace' | 'keep' | 'skip', in
 * the order of `items`) or 'cancel'.
 */
export default {
    components: { Window, Button, Checkbox },
    props: {
        /** The files whose names exist: `{ path }` (the dataset path of the file being written). */
        items: {
            type: Array,
            default: () => []
        },
        /** What is being done to the files: 'paste' or 'upload'. */
        verb: {
            type: String,
            default: 'paste'
        },
        /** Offer Keep both, one file at a time with Apply to all. */
        keepBoth: {
            type: Boolean,
            default: false
        }
    },
    emits: ['resolve'],

    data() {
        return { index: 0, applyToAll: false, choices: [] };
    },

    computed: {
        title() {
            return `${this.verb.charAt(0).toUpperCase()}${this.verb.slice(1)} Conflict`;
        },
        participle() {
            return PARTICIPLES[this.verb] ?? `${this.verb}ed`;
        },
        current() {
            return this.items[this.index] ?? null;
        },
        // The conflicts not decided yet, the one on show included
        remaining() {
            return this.items.length - this.index;
        }
    },

    methods: {
        basename(p) { return pathutils.basename(p); },
        folderOf(p) {
            const slash = String(p).lastIndexOf('/');
            return slash > 0 ? p.slice(0, slash) : '';
        },
        // The word that agrees with the number of conflicting files
        word(singular, plural) { return pluralize(this.items.length, singular, plural); },
        cancel() { this.$emit('resolve', 'cancel'); },
        choose(mode) { this.$emit('resolve', mode); },
        /** @param {'replace'|'keep'|'skip'} choice */
        decide(choice) {
            const count = this.applyToAll ? this.remaining : 1;
            for (let i = 0; i < count; i++) this.choices.push(choice);
            this.index += count;
            if (this.index >= this.items.length) this.$emit('resolve', this.choices.slice());
        }
    }
};
</script>

<style scoped>
.paste-conflict-content {
    max-height: 22rem;
    overflow-y: auto;
}

.file-list {
    list-style: none;
    padding: 0;
    margin: 0.5rem 0 0 0;
}

.file-item {
    padding: var(--ddb-spacing-xs) var(--ddb-spacing-sm);
    margin: var(--ddb-spacing-xs) 0;
    border-radius: var(--ddb-radius-sm);
    background-color: rgba(var(--ddb-warning-rgb), 0.1);
    display: flex;
    align-items: center;
    gap: var(--ddb-spacing-sm);
}

.amber { color: var(--ddb-warning); }

.file-path {
    word-break: break-all;
}

.conflict-question strong {
    word-break: break-all;
}

.conflict-count {
    color: var(--ddb-text-secondary);
    font-size: var(--ddb-font-size-sm);
}

.apply-all {
    display: flex;
    align-items: center;
    gap: var(--ddb-spacing-sm);
}
</style>
