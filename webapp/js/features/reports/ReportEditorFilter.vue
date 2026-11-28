<template>
    <div class="report-editor-filter">
        <fieldset class="mb-4">
            <legend class="fw-semibold">Filter</legend>
            <p class="text-muted">The report lists the items that pass every list that has a choice ticked. A list with nothing ticked lets every item through.</p>
            <fieldset v-for="list in lists" :key="list.key" class="mb-3">
                <legend class="d-block mb-1">{{ list.label }}</legend>
                <p v-if="!list.options.length" class="text-muted mb-1">None to choose from.</p>
                <div class="report-filter-options">
                    <div v-for="option in list.options" :key="option.id" class="d-flex align-items-center gap-2">
                        <Checkbox v-model="draft.filter[list.key]" :input-id="`report-filter-${list.key}-${option.id}`" :value="option.id" />
                        <label :for="`report-filter-${list.key}-${option.id}`">{{ option.label }}</label>
                    </div>
                </div>
            </fieldset>
        </fieldset>

        <fieldset class="mb-4">
            <legend class="fw-semibold">Sections</legend>
            <p class="text-muted">The parts of the report, in order. Switch a part off to leave it out.</p>
            <ol class="report-section-list">
                <li v-for="(section, index) in draft.sections" :key="section.kind" class="report-section-row">
                    <Checkbox v-model="section.enabled" :input-id="`report-section-${section.kind}`" binary />
                    <label :for="`report-section-${section.kind}`" class="report-section-name">{{ SECTION_LABELS[section.kind] }}</label>
                    <Button size="small" severity="secondary" text icon="fa-solid fa-arrow-up" :disabled="index === 0"
                            :aria-label="`Move ${SECTION_LABELS[section.kind]} up`" @click="editor.moveSection(index, -1)" />
                    <Button size="small" severity="secondary" text icon="fa-solid fa-arrow-down" :disabled="index === draft.sections.length - 1"
                            :aria-label="`Move ${SECTION_LABELS[section.kind]} down`" @click="editor.moveSection(index, 1)" />
                </li>
            </ol>
        </fieldset>
    </div>
</template>

<script setup>
/**
 * The filter and the sections of the report editor. The filter lists are the groups of the sources (with their source
 * label), the categories, severities and statuses of the organization's schema, the measurement kinds and the owner
 * (2D map or 3D viewer).
 */
import { computed } from 'vue';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import { SECTION_LABELS } from '@/libs/reports/reportSettings';
import { KIND_LABELS } from '@/libs/reports/reportKinds';
import { injectReportEditor } from './useReportEditor';

const OWNER_LABELS = { map: '2D map', pointCloud: '3D point cloud viewer' };

const editor = injectReportEditor();
const { draft } = editor;

const choices = (/** @type {{ id: string, name: string }[]} */ list) => list.map(entry => ({ id: entry.id, label: entry.name }));

const lists = computed(() => [
    { key: 'groups', label: 'Groups', options: editor.groupOptions.value },
    { key: 'categories', label: 'Categories', options: choices(editor.schema.value.categories) },
    { key: 'severities', label: 'Severities', options: choices(editor.schema.value.severities) },
    { key: 'statuses', label: 'Statuses', options: choices(editor.schema.value.statuses) },
    { key: 'kinds', label: 'Kinds', options: editor.filterChoices.kinds.map(id => ({ id, label: KIND_LABELS[id] ?? id })) },
    { key: 'owners', label: 'Made in', options: editor.filterChoices.owners.map(id => ({ id, label: OWNER_LABELS[id] ?? id })) }
].filter(list => list.key !== 'groups' || list.options.length));
</script>

<style scoped>
.report-filter-options {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ddb-spacing-xs) var(--ddb-spacing-lg);
}

.report-section-list {
    margin: 0;
    padding: 0;
    list-style: none;
}

.report-section-row {
    display: flex;
    align-items: center;
    gap: var(--ddb-spacing-sm);
}

.report-section-name {
    flex: 1;
}

fieldset {
    border: 0;
    padding: 0;
    margin-left: 0;
    margin-right: 0;
}
</style>
