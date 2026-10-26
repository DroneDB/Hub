<template>
    <Window id="preferencesDialog" title="Preferences" modal fixed-size size-class="dialog-lg" @close="$emit('close')">
        <Tabs v-model:value="activeTab" class="pref-tabs">
            <TabList>
                <Tab v-for="tab in TABS" :key="tab.value" :value="tab.value">
                    <i :class="tab.icon" aria-hidden="true" /><span class="tab-label">{{ tab.label }}</span>
                </Tab>
            </TabList>
            <TabPanels>
                <TabPanel v-for="tab in TABS" :key="tab.value" :value="tab.value">
                    <section v-for="group in tab.groups" :key="group.title ?? tab.value" class="pref-group">
                        <h3 v-if="group.title">{{ group.title }}</h3>

                        <div v-for="control in group.controls" :key="control.id" class="pref-row">
                            <template v-if="control.kind === 'range'">
                                <RangeSetting v-model="control.model.value" :label="control.label" :min="control.min"
                                              :max="control.max" :step="control.step" :format="control.format" />
                            </template>
                            <template v-else>
                                <label :id="`pref-${control.id}-label`" :for="`pref-${control.id}`" class="pref-label">{{ control.label }}</label>
                                <Select v-if="control.kind === 'select'" v-model="control.model.value"
                                        :input-id="`pref-${control.id}`" :aria-labelledby="`pref-${control.id}-label`"
                                        :options="control.options"
                                        option-label="label" option-value="value" class="pref-select" />
                                <ToggleSwitch v-else v-model="control.model.value" :input-id="`pref-${control.id}`" />
                            </template>
                        </div>
                    </section>

                    <section v-if="tab.value === 'map'" class="pref-group">
                        <h3>Custom basemap</h3>
                        <dl v-if="customBasemap" class="custom-basemap">
                            <div>
                                <dt>Source type</dt>
                                <dd>{{ customBasemap.sourceType.toUpperCase() }}</dd>
                            </div>
                            <div>
                                <dt>URL</dt>
                                <dd class="custom-basemap-url">{{ customBasemap.url }}</dd>
                            </div>
                            <div v-if="customBasemap.attribution">
                                <dt>Attribution</dt>
                                <dd>{{ plainText(customBasemap.attribution) }}</dd>
                            </div>
                        </dl>
                        <p v-else class="pref-hint">No custom basemap is set.</p>
                        <p class="pref-hint">
                            To edit the custom basemap, open the map settings of any map: they test the
                            tiles before saving.
                        </p>
                        <Button v-if="storedCustomBasemap" severity="secondary" size="small" icon="fa-solid fa-xmark"
                                label="Clear" @click="storedCustomBasemap = null" />
                    </section>

                    <div class="pref-actions">
                        <Button severity="secondary" size="small" icon="fa-solid fa-rotate-left" label="Reset section"
                                @click="resetSections(tab.sections)" />
                    </div>
                </TabPanel>
            </TabPanels>
        </Tabs>

        <DialogHost :dialogs="dialogs" />

        <template #footer>
            <Button class="footer-button" severity="danger" text size="small" icon="fa-solid fa-rotate-left" label="Reset all" @click="resetAll" />
            <span class="sync-status ms-2 me-auto" role="status" aria-live="polite" :class="`sync-${store.status}`">
                <i :class="statusIcon" /> {{ statusText }}
            </span>
            <Button class="footer-button" label="Close" severity="secondary" @click="$emit('close')" />
        </template>
    </Window>
</template>

<script setup>
/**
 * PreferencesDialog - the settings that follow the user's account, one tab per area. Every
 * control is bound to its stored preference, so it is live in both directions: a change
 * here reaches the open views, and a change there (another tab, the account) shows here.
 * The preferences store sends what changes to the account. Each tab resets its own sections;
 * "Reset all" asks first, with a confirm window that opens above this one.
 */
import { computed, ref, toRef } from 'vue';
import Button from 'primevue/button';
import Select from 'primevue/select';
import Tab from 'primevue/tab';
import TabList from 'primevue/tablist';
import TabPanel from 'primevue/tabpanel';
import TabPanels from 'primevue/tabpanels';
import Tabs from 'primevue/tabs';
import ToggleSwitch from 'primevue/toggleswitch';
import DialogHost from '@/components/DialogHost.vue';
import Window from '@/components/HubWindow.vue';
import RangeSetting from '@/components/RangeSetting.vue';
import { useConfirm } from '@/composables/useConfirm';
import { useDialogs } from '@/composables/useDialogs';
import { usePreference } from '@/composables/usePreference';
import { useViewerSettings } from '@/composables/useViewerSettings';
import { Basemaps, getCustomBasemapConfig } from '@/libs/map/basemaps';
import { PREF, PREF_DEFAULTS } from '@/libs/preferences';
import { usePreferencesStore } from '@/stores/preferences';

defineOptions({ name: 'PreferencesDialog' });
defineEmits(['close']);

const store = usePreferencesStore();
const dialogs = useDialogs();
const confirm = useConfirm(dialogs);

const activeTab = ref('units');

const datasetTable = useViewerSettings(PREF.DATASET_TABLE, PREF_DEFAULTS[PREF.DATASET_TABLE]).settings;
const orgPage = useViewerSettings(PREF.ORG_PAGE, PREF_DEFAULTS[PREF.ORG_PAGE]).settings;
const nexusLighting = useViewerSettings(PREF.NEXUS_LIGHTING, PREF_DEFAULTS[PREF.NEXUS_LIGHTING]).settings;
const unifiedViewer = useViewerSettings(PREF.UNIFIED_VIEWER, PREF_DEFAULTS[PREF.UNIFIED_VIEWER]).settings;

/** @param {Array<string|number>} values @param {(v: any) => string} [label] */
const optionsOf = (values, label = String) => values.map(value => ({ value, label: label(value) }));

const PAGE_SIZES = optionsOf([5, 10, 25, 50, 100]);

/** @param {string} id @param {string} label @param {import('vue').Ref} model @param {Array<{label: string, value: any}>} options */
const select = (id, label, model, options) => ({ id, label, kind: 'select', model, options });
/** @param {string} id @param {string} label @param {import('vue').Ref} model */
const toggle = (id, label, model) => ({ id, label, kind: 'switch', model });
/** @param {string} id @param {string} label @param {import('vue').Ref} model @param {number} max @param {Record<string, any>} [extra] */
const range = (id, label, model, max, extra) => ({ id, label, kind: 'range', model, min: 0, max, ...extra });

const basemapOptions = Object.entries(Basemaps).map(([value, { label }]) => ({ value, label }));

/** `sections` are the account sections the tab shows: its "Reset section" returns them to the defaults. */
const TABS = [
    {
        value: 'units', label: 'Units', icon: 'fa-solid fa-ruler', sections: ['units'],
        groups: [{
            controls: [
                select('measurement-units', 'Measurement units', usePreference(PREF.MEASURE_UNIT, PREF_DEFAULTS[PREF.MEASURE_UNIT]),
                    [{ value: 'metric', label: 'Metric' }, { value: 'imperial', label: 'Imperial' }])
            ]
        }]
    },
    {
        value: 'map', label: 'Map', icon: 'fa-solid fa-map', sections: ['map'],
        groups: [{
            controls: [
                select('basemap', 'Default basemap', usePreference(PREF.BASEMAP, PREF_DEFAULTS[PREF.BASEMAP]), basemapOptions),
                toggle('flight-path', 'Show flight path', usePreference(PREF.SHOW_FLIGHT_PATH, PREF_DEFAULTS[PREF.SHOW_FLIGHT_PATH])),
                toggle('direction-indicators', 'Show direction indicators', usePreference(PREF.SHOW_DIRECTION_INDICATORS, PREF_DEFAULTS[PREF.SHOW_DIRECTION_INDICATORS]))
            ]
        }]
    },
    {
        value: 'files', label: 'Files', icon: 'fa-solid fa-folder-open', sections: ['explorer'],
        groups: [{
            controls: [
                select('file-view-mode', 'Default view', usePreference(PREF.FILE_VIEW_MODE, PREF_DEFAULTS[PREF.FILE_VIEW_MODE]),
                    [{ value: 'grid', label: 'Grid' }, { value: 'table', label: 'Table' }]),
                toggle('table-expanded-grid', 'Expanded grid in the table view', usePreference(PREF.TABLE_EXPANDED_GRID, PREF_DEFAULTS[PREF.TABLE_EXPANDED_GRID])),
                toggle('sort-descending', 'Sort descending', usePreference(PREF.SORT_DESCENDING, PREF_DEFAULTS[PREF.SORT_DESCENDING]))
            ]
        }]
    },
    {
        value: 'lists', label: 'Lists', icon: 'fa-solid fa-list', sections: ['datasets', 'orgs'],
        groups: [
            {
                title: 'Datasets',
                controls: [
                    select('datasets-per-page', 'Datasets per page', toRef(datasetTable, 'itemsPerPage'), PAGE_SIZES),
                    toggle('open-after-create', 'Open a dataset after creating it', usePreference(PREF.OPEN_AFTER_CREATE, PREF_DEFAULTS[PREF.OPEN_AFTER_CREATE]))
                ]
            },
            {
                title: 'Organizations',
                controls: [
                    select('orgs-per-page', 'Organizations per page', toRef(orgPage, 'itemsPerPage'), PAGE_SIZES),
                    toggle('orgs-owned-only', 'Show only the organizations I own', toRef(orgPage, 'ownedOnly'))
                ]
            }
        ]
    },
    {
        value: 'viewers', label: 'Viewers', icon: 'fa-solid fa-cube', sections: ['viewers'],
        groups: [
            {
                title: 'Gaussian splats',
                controls: [
                    select('splat-nav-mode', 'Navigation mode', usePreference(PREF.SPLAT_NAV_MODE, PREF_DEFAULTS[PREF.SPLAT_NAV_MODE]),
                        [{ value: 'fly', label: 'Fly' }, { value: 'earth', label: 'Earth' }])
                ]
            },
            {
                title: 'Nexus models lighting',
                controls: [
                    range('nexus-ambient', 'Ambient', toRef(nexusLighting, 'ambientIntensity'), 3),
                    range('nexus-directional', 'Directional', toRef(nexusLighting, 'directionalIntensity'), 3),
                    range('nexus-shininess', 'Shininess', toRef(nexusLighting, 'shininess'), 100, { step: 5, format: String })
                ]
            },
            {
                title: '3D viewer lighting',
                controls: [
                    range('unified-ambient', 'Ambient', toRef(unifiedViewer, 'ambientIntensity'), 5),
                    range('unified-directional', 'Directional', toRef(unifiedViewer, 'directionalIntensity'), 5),
                    range('unified-hemisphere', 'Sky / ground fill', toRef(unifiedViewer, 'hemisphereIntensity'), 5)
                ]
            }
        ]
    }
];

// The custom basemap: shown as the map reads it (an invalid one is ignored there too), cleared here
const storedCustomBasemap = usePreference(PREF.CUSTOM_BASEMAP, PREF_DEFAULTS[PREF.CUSTOM_BASEMAP]);
const customBasemap = computed(() => (storedCustomBasemap.value ? getCustomBasemapConfig() : null));

/** The attribution is HTML for the map; the dialog shows its text. @param {string} html */
const plainText = html => html.replace(/&copy;/g, '©');

const STATUS = {
    idle: { icon: 'fa-solid fa-circle-check', text: 'Saved to your account' },
    loading: { icon: 'fa-solid fa-spinner fa-spin', text: 'Saving...' },
    saving: { icon: 'fa-solid fa-spinner fa-spin', text: 'Saving...' },
    error: { icon: 'fa-solid fa-triangle-exclamation', text: 'Not saved, retried on the next change' }
};
const statusIcon = computed(() => STATUS[store.status].icon);
const statusText = computed(() => STATUS[store.status].text);

/** @param {string[]} sections */
function resetSections(sections) {
    sections.forEach(section => store.resetSection(section));
}

async function resetAll() {
    const confirmed = await confirm({
        title: 'Reset all preferences',
        message: 'Every preference returns to its default, on this device and on your account.',
        confirmText: 'Reset all',
        danger: true
    });
    if (confirmed) store.resetAll();
}
</script>

<style scoped>
/* The window keeps one size for every tab: the panels scroll inside it, not the page */
.pref-tabs {
    width: min(34rem, calc(100vw - 4rem));
}

.pref-tabs :deep(.p-tabpanels) {
    height: min(26rem, 55vh);
    overflow-y: auto;
}

.pref-group {
    margin-bottom: 1.5rem;
}

.pref-group h3 {
    margin: 0 0 0.75rem 0;
    font-size: var(--ddb-font-size-base);
    color: var(--ddb-text);
}

.pref-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.75rem;
}

.pref-row > :deep(.range-setting) {
    flex: 1;
    margin-bottom: 0;
}

.pref-label {
    color: var(--ddb-text);
}

/* 12rem when there is room; narrower (never past the panel edge) on a phone */
.pref-select {
    flex: 0 1 12rem;
    min-width: 0;
}

.pref-hint {
    margin: 0 0 0.75rem 0;
    font-size: var(--ddb-font-size-sm);
    color: var(--ddb-text-secondary);
}

.custom-basemap {
    margin: 0 0 0.75rem 0;
}

.custom-basemap dt {
    font-weight: bold;
    font-size: var(--ddb-font-size-sm);
    color: var(--ddb-text-secondary);
}

.custom-basemap dd {
    margin: 0 0 0.5rem 0;
    color: var(--ddb-text);
}

.custom-basemap-url {
    overflow-wrap: anywhere;
}

.pref-actions {
    display: flex;
    justify-content: flex-end;
}

/* The status takes the room between the two buttons and wraps there; the buttons keep one line */
.footer-button {
    flex-shrink: 0;
    white-space: nowrap;
}

.sync-status {
    align-self: center;
    min-width: 0;
    font-size: var(--ddb-font-size-sm);
    color: var(--ddb-text-secondary);
}

.sync-status.sync-error {
    color: var(--ddb-danger);
}
</style>
