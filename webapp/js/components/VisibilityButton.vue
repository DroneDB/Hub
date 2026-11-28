<template>
    <span v-if="shown" class="visibility-control">
        <!-- A user who can write the dataset changes its visibility here; anyone else sees what it is -->
        <template v-if="canWrite">
            <button type="button" class="visibility-button" :aria-label="`Visibility: ${label}. Change the visibility`"
                    :title="description" aria-haspopup="menu" :aria-controls="menuId" :aria-expanded="String(menuOpen)"
                    :disabled="busy" :aria-busy="busy ? 'true' : undefined" @click="menu?.toggle($event)">
                <VisibilityTag rounded class="visibility-chip" :visibility="visibility">
                    <i class="fa-solid fa-caret-down visibility-caret" aria-hidden="true" />
                </VisibilityTag>
            </button>
            <Menu :id="menuId" ref="menu" :model="items" popup @show="menuOpen = true" @hide="menuOpen = false">
                <template #item="{ item, props: itemProps }">
                    <a v-bind="itemProps.action" class="visibility-option">
                        <i :class="item.icon" class="visibility-option-icon" aria-hidden="true" />
                        <span class="visibility-option-text">
                            <span class="visibility-option-label">{{ item.label }}<span v-if="item.current" class="visually-hidden"> (current)</span></span>
                            <span class="visibility-option-description">{{ item.description }}</span>
                        </span>
                        <i v-if="item.current" class="fa-solid fa-check visibility-option-check" aria-hidden="true" />
                    </a>
                </template>
            </Menu>
            <DialogHost :dialogs="dialogs" />
        </template>
        <VisibilityTag v-else rounded class="visibility-chip" :visibility="visibility" :title="description" />
    </span>
</template>

<script setup>
/**
 * VisibilityButton - the visibility of the open dataset, in the header after its name. For a user who
 * can write the dataset it is a button: its menu lists Private, Unlisted and Public with what each means, and picking
 * another one asks first, then changes it (composables/useVisibilityChange.js). Anyone else sees the tag only.
 *
 * It reads the dataset's root entry from the session (the dataset page and the viewers put it there): its
 * visibility, its permissions and its name. Nothing shows until the entry is read, nor for a dataset that did not load.
 *
 *   <VisibilityButton :org="$route.params.org" :ds="$route.params.ds" />
 */
import { computed, ref, useId } from 'vue';
import Menu from 'primevue/menu';
import ddb from 'ddb';
import reg from '@/libs/api/sharedRegistry';
import VisibilityTag from '@/components/VisibilityTag.vue';
import DialogHost from '@/components/DialogHost.vue';
import { useDialogs } from '@/composables/useDialogs';
import { useConfirm } from '@/composables/useConfirm';
import { useVisibilityChange } from '@/composables/useVisibilityChange';
import { permissionsOf } from '@/libs/datasetPermissions';
import { VISIBILITY_OPTIONS, visibilityDescription, visibilityLabel, visibilityLook } from '@/libs/visibility';
import { useDatasetSessionStore } from '@/stores/datasetSession';

defineOptions({ name: 'VisibilityButton' });

const props = defineProps({
    /** Slug of the organization of the dataset (the route's `org`) */
    org: { type: String, required: true },
    /** Slug of the dataset (the route's `ds`) */
    ds: { type: String, required: true }
});

const session = useDatasetSessionStore();
const dialogs = useDialogs();
const changeVisibility = useVisibilityChange(useConfirm(dialogs));

// Each computed reads the entry from the session itself: a change of the visibility changes the entry in place
// (setRootMeta), so a computed that returned the entry would be the same object and would not update the others
const currentRoot = () => (session.unavailable ? null : session.rootEntry);
const shown = computed(() => !!currentRoot());
// The server keeps the visibility as the number of ddb.Visibility (a stored one can come as text)
const visibility = computed(() => {
    const data = currentRoot()?.properties?.meta?.visibility?.data;
    return data == null ? null : Number(data);
});
const canWrite = computed(() => permissionsOf(currentRoot()).canWrite);
const label = computed(() => visibilityLabel(visibility.value));
const description = computed(() => visibilityDescription(visibility.value));

const menu = ref(null);
const menuId = useId();
const menuOpen = ref(false);
const busy = ref(false);

const items = computed(() => VISIBILITY_OPTIONS.map(option => ({
    label: option.label,
    icon: visibilityLook(option.value).icon,
    description: visibilityDescription(option.value),
    // The one the tag shows (a missing or unknown visibility shows as Private)
    current: option.label === label.value,
    command: () => pick(option.value)
})));

async function pick(to) {
    const root = currentRoot();
    if (busy.value || !root) return;
    busy.value = true;
    try {
        await changeVisibility(reg.Organization(props.org).Dataset(props.ds), {
            name: ddb.utils.entryLabel(root), from: visibility.value, to
        });
    } finally {
        busy.value = false;
    }
}
</script>

<style scoped>
.visibility-control {
    display: inline-flex;
    align-items: center;
}

/* The tag is the button: no frame of its own, and a tap target of 2rem around the smaller tag */
.visibility-button {
    display: inline-flex;
    align-items: center;
    min-height: 2rem;
    padding: 0;
    border: 0;
    border-radius: var(--ddb-radius-md);
    background: none;
    color: inherit;
    cursor: pointer;
}

.visibility-button:disabled {
    cursor: progress;
    opacity: 0.6;
}

.visibility-button:hover > .p-tag {
    filter: brightness(0.95);
}

/* A label, one step under the text of the header (as the Admin role next to the user's name) */
.visibility-chip {
    font-size: var(--ddb-font-size-sm);
    white-space: nowrap;
}

.visibility-caret {
    margin-left: var(--ddb-spacing-xs);
}

.visibility-option {
    display: flex;
    align-items: flex-start;
    gap: var(--ddb-spacing-sm);
    max-width: var(--ddb-tooltip-max-width);
}

.visibility-option-icon {
    width: 1rem;
    margin-top: var(--ddb-spacing-xs);
    text-align: center;
}

.visibility-option-text {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-width: 0;
}

.visibility-option-label {
    font-weight: 600;
}

.visibility-option-description {
    color: var(--ddb-text-secondary);
    font-size: var(--ddb-font-size-sm);
    white-space: normal;
}

.visibility-option-check {
    margin-top: var(--ddb-spacing-xs);
    color: var(--ddb-primary);
}
</style>
