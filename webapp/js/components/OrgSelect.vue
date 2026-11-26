<template>
    <!-- The organizations to choose from, each with its logo: in the list and in the box that shows the choice -->
    <!-- eslint-disable-next-line vuejs-accessibility/form-control-has-label -- the caller names it (aria-labelledby or aria-label), which reaches the Select with the other attributes -->
    <Select v-bind="$attrs" :model-value="modelValue" :options="options" option-label="label" option-value="slug"
            @update:model-value="emit('update:modelValue', $event)">
        <template #option="{ option }">
            <span class="org-select-item">
                <OrgLogo :org="option.org" size="sm" decorative />
                <span class="org-select-name">{{ option.label }}</span>
            </span>
        </template>
        <template #value="{ value, placeholder }">
            <span v-if="chosen" class="org-select-item">
                <OrgLogo :org="chosen.org" size="sm" decorative />
                <span class="org-select-name">{{ chosen.label }}</span>
            </span>
            <template v-else>{{ value ?? placeholder }}</template>
        </template>
    </Select>
</template>

<script setup>
/**
 * OrgSelect - a PrimeVue Select of organizations that shows the logo of each one (OrgLogo) before its name, so the
 * organization is known by its logo as it is on its own page. The v-model is the slug. `organizations` are the
 * organizations as the Registry lists them (slug, name, logoUrl); every other attribute (input-id, filter, placeholder,
 * disabled, aria-labelledby...) goes to the Select.
 *
 *   <OrgSelect v-model="orgSlug" :organizations="organizations" input-id="upload-org" placeholder="Select an organization" />
 */
import { computed } from 'vue';
import Select from 'primevue/select';
import OrgLogo from '@/components/OrgLogo.vue';

defineOptions({ name: 'OrgSelect', inheritAttrs: false });

const props = defineProps({
    modelValue: { type: String, default: null },
    /** The organizations to choose from: { slug, name, logoUrl } */
    organizations: { type: Array, default: () => [] }
});
const emit = defineEmits(['update:modelValue']);

const options = computed(() => props.organizations.map(org => ({ slug: org.slug, label: org.name || org.slug, org })));
const chosen = computed(() => options.value.find(option => option.slug === props.modelValue) ?? null);
</script>

<style scoped>
.org-select-item {
    display: flex;
    align-items: center;
    gap: var(--ddb-spacing-sm);
    min-width: 0;
}

.org-select-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
</style>
