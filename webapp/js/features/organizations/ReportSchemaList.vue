<template>
    <section class="schema-list" :aria-labelledby="`${idBase}-title`" :data-test="`schema-${list.key}`">
        <div class="d-flex align-items-center justify-content-between gap-2 mb-2">
            <h3 :id="`${idBase}-title`" class="schema-list-title">{{ list.label }}</h3>
            <ActionButton v-if="!readOnly" severity="secondary" outlined size="small" icon="fa-solid fa-plus" show-label
                          :label="`Add ${list.single}`" :disabled="!canAdd" :disabled-reason="`At most ${limits.max} ${list.key}`"
                          @click="add" />
        </div>
        <FieldError :id="`${idBase}-error`" :message="listError" />

        <p v-if="!entries.length" class="text-muted mb-0">No {{ list.key }}.</p>
        <ul v-else class="schema-entries">
            <li v-for="(entry, index) in entries" :key="index" class="schema-entry">
                <div class="d-flex flex-wrap align-items-start gap-2">
                    <input v-if="list.hasColour" type="color" class="schema-colour" :value="entry.colour" :disabled="readOnly"
                           :aria-label="`Colour of ${label(entry, index)}`" @input="entry.colour = $event.target.value">
                    <div class="schema-name">
                        <InputText :id="`${idBase}-${index}-name`" :model-value="entry.name" class="w-100" autocomplete="off" :maxlength="nameMax"
                                   :disabled="readOnly" :aria-label="`Name of ${list.single} ${index + 1}`" :invalid="!!errorAt(index, 'name')"
                                   :aria-invalid="errorAt(index, 'name') ? 'true' : undefined"
                                   :aria-describedby="errorAt(index, 'name') ? `${idBase}-${index}-name-error` : undefined"
                                   @update:model-value="rename(entry, $event)" />
                        <FieldError :id="`${idBase}-${index}-name-error`" :message="errorAt(index, 'name')" />
                    </div>
                    <div v-if="list.hasClosed" class="schema-closed d-flex align-items-center gap-1">
                        <Checkbox :model-value="entry.closed" binary :disabled="readOnly" :input-id="`${idBase}-${index}-closed`"
                                  @update:model-value="entry.closed = $event" />
                        <label :for="`${idBase}-${index}-closed`">Closed</label>
                    </div>
                    <div v-if="!readOnly" class="d-flex gap-1">
                        <Button severity="secondary" text size="small" icon="fa-solid fa-arrow-up" :disabled="index === 0"
                                :aria-label="`Move ${label(entry, index)} up`" @click="move(index, -1)" />
                        <Button severity="secondary" text size="small" icon="fa-solid fa-arrow-down" :disabled="index === entries.length - 1"
                                :aria-label="`Move ${label(entry, index)} down`" @click="move(index, 1)" />
                        <ActionButton severity="danger" text size="small" icon="fa-solid fa-trash" :label="`Remove ${label(entry, index)}`"
                                      :disabled="!canRemove" :disabled-reason="`Keep at least one ${list.single}`" @click="remove(index)" />
                    </div>
                </div>
                <small :id="`${idBase}-${index}-id`" class="schema-id text-muted">
                    ID <code>{{ entry.id || '(made from the name)' }}</code>
                    <template v-if="isSaved(entry)"> - fixed once saved; renaming changes only the name shown</template>
                </small>
                <FieldError :id="`${idBase}-${index}-id-error`" :message="errorAt(index, 'id')" />
                <FieldError :id="`${idBase}-${index}-colour-error`" :message="errorAt(index, 'colour')" />
            </li>
        </ul>
    </section>
</template>

<script setup>
/**
 * One list of the annotation schema (categories, severities or statuses): the entries with their names, colours
 * (statuses have the `closed` flag instead), their order, and Add / Remove. The id of a new entry is made from its
 * name and follows it until the schema is saved; from then on it never changes (stored annotations name it), and a
 * rename changes only the name shown. The list keeps its minimum: the last category and the last status cannot be
 * removed.
 */
import { computed, useId } from 'vue';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import InputText from 'primevue/inputtext';
import ActionButton from '@/components/ActionButton.vue';
import FieldError from '@/components/FieldError.vue';
import { LIMITS, canAddEntry, canRemoveEntry, idFromName, newSchemaEntry, problemAt } from '@/libs/reports/reportSettings';

const entries = defineModel({ type: Array, required: true });
const props = defineProps({
    /** One of SCHEMA_LISTS: { key, label, single, hasColour, hasClosed } */
    list: { type: Object, required: true },
    readOnly: { type: Boolean, default: false },
    /** The problems by path (keyProblems), the Registry's and the form's */
    errors: { type: Object, default: () => ({}) },
    /** The ids of this list that are stored: they are not made from the name any more */
    savedIds: { type: Object, default: () => new Set() }
});

const idBase = `schema-${props.list.key}-${useId()}`;
const limits = computed(() => LIMITS[props.list.key]);
const nameMax = LIMITS.name.max;
const canAdd = computed(() => canAddEntry(props.list.key, entries.value));
const canRemove = computed(() => canRemoveEntry(props.list.key, entries.value));
const listError = computed(() => problemAt(props.errors, props.list.key));

const label = (entry, index) => entry.name?.trim() || `${props.list.single} ${index + 1}`;
const errorAt = (index, field) => problemAt(props.errors, `${props.list.key}.${index}.${field}`);
const isSaved = entry => props.savedIds.has(entry.id);

function add() {
    if (canAdd.value) entries.value.push(newSchemaEntry(props.list.key, entries.value, ''));
}

function remove(index) {
    if (canRemove.value) entries.value.splice(index, 1);
}

function move(index, by) {
    const [entry] = entries.value.splice(index, 1);
    entries.value.splice(index + by, 0, entry);
}

function rename(entry, name) {
    entry.name = name;
    if (isSaved(entry)) return;
    entry.id = idFromName(name, entries.value.filter(other => other !== entry).map(other => other.id));
}
</script>

<style scoped>
.schema-list-title {
    font-size: 1.05rem;
    margin: 0;
}

.schema-entries {
    list-style: none;
    margin: 0;
    padding: 0;
}

.schema-entry {
    padding: var(--ddb-spacing-xs) 0;
    border-bottom: var(--ddb-border-width) solid var(--ddb-border);
}

.schema-colour {
    flex: 0 0 auto;
    width: 2.25rem;
    height: 2.25rem;
    padding: 0;
    border: var(--ddb-border-width) solid var(--ddb-border);
    border-radius: var(--ddb-radius-sm);
    cursor: pointer;
}

.schema-colour:disabled {
    cursor: default;
}

.schema-name {
    flex: 1 1 10rem;
    min-width: 0;
}

.schema-closed {
    align-self: center;
}

.schema-id {
    display: block;
    margin-top: 0.15rem;
}
</style>
