<template>
    <Window id="preferencesDialog" title="User preferences" modal fixed-size size-class="dialog-lg" @close="$emit('close')">
        <Tabs ref="tabsRef" v-model:value="activeTab" class="pref-tabs">
            <TabList>
                <Tab v-for="tab in visibleTabs" :key="tab.value" :value="tab.value">
                    <i :class="tab.icon" aria-hidden="true" /><span class="tab-label">{{ tab.label }}</span>
                </Tab>
            </TabList>
            <TabPanels>
                <TabPanel v-for="tab in visibleTabs" :key="tab.value" :value="tab.value">
                    <section v-for="group in tab.groups" :key="group.title ?? tab.value" class="pref-group">
                        <h3 v-if="group.title">{{ group.title }}</h3>

                        <template v-for="control in group.controls" :key="control.id">
                            <div class="pref-row">
                                <template v-if="control.kind === 'range'">
                                    <RangeSetting v-model="control.model.value" :label="control.label" :min="control.min"
                                                  :max="control.max" :step="control.step" :format="control.format" />
                                </template>
                                <template v-else>
                                    <label :id="`pref-${control.id}-label`" :for="`pref-${control.id}`" class="pref-label">{{ control.label }}</label>
                                    <Select v-if="control.kind === 'select'" v-model="control.model.value"
                                            :input-id="`pref-${control.id}`" :aria-labelledby="`pref-${control.id}-label`"
                                            :pt="{ label: { 'aria-describedby': control.hint?.value ? `pref-${control.id}-hint` : undefined } }"
                                            :options="control.options" :disabled="!!control.disabled?.value" :filter="!!control.filter"
                                            option-label="label" option-value="value" class="pref-select" />
                                    <ToggleSwitch v-else v-model="control.model.value" :input-id="`pref-${control.id}`" />
                                </template>
                            </div>
                            <p v-if="control.hint?.value" :id="`pref-${control.id}-hint`" class="pref-hint">{{ control.hint.value }}</p>
                        </template>
                        <component :is="group.component" v-if="group.component" />
                    </section>

                    <section v-if="tab.value === 'map' && editingCustom" class="pref-group">
                        <h3>Custom basemap</h3>
                        <CustomBasemapEditor id-prefix="pref-custom-basemap" @applied="onCustomApplied" @cleared="onCustomCleared" />
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
 *
 * The Notifications tab exists only on a server that sends e-mail; its setting is disabled,
 * with the reason, when the server cannot e-mail this account.
 *
 * A group is a list of controls (select, toggle, range) or, for a setting those cannot show, a
 * component of its own (the stockpile materials).
 */
import { computed, nextTick, ref, toRef, watch } from 'vue';
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
import StockpileMaterialsEditor from './StockpileMaterialsEditor.vue';
import CustomBasemapEditor from '@/features/viewers/map/CustomBasemapEditor.vue';
import { useBasemapChoice } from '@/composables/useBasemapChoice';
import { useConfirm } from '@/composables/useConfirm';
import { useDialogs } from '@/composables/useDialogs';
import { usePreference } from '@/composables/usePreference';
import { useViewerSettings } from '@/composables/useViewerSettings';
import reg from '@/libs/api/sharedRegistry';
import { Features } from '@/libs/features';
import { currencyChoices, normalizeCurrency } from '@/libs/format';
import { Basemaps } from '@/libs/map/basemaps';
import { ORG_SORT_OPTIONS } from '@/libs/organizationList';
import { PREF, PREF_DEFAULTS, prefChoice } from '@/libs/preferences';
import { orgPageChoice } from '@/libs/storageUtils';
import { QUALITY_CHOICES } from '@/features/viewers/splat/qualityPresets';
import { useAuthStore } from '@/stores/auth';
import { usePreferencesStore } from '@/stores/preferences';

defineOptions({ name: 'PreferencesDialog' });
const props = defineProps({
    /** The tab shown first (a tab `value`); the first tab when it is unknown or hidden */
    initialTab: { type: String, default: 'units' }
});
defineEmits(['close']);

const store = usePreferencesStore();
const auth = useAuthStore();
const dialogs = useDialogs();
const confirm = useConfirm(dialogs);

const datasetTable = useViewerSettings(PREF.DATASET_TABLE, PREF_DEFAULTS[PREF.DATASET_TABLE]).settings;
const orgPage = useViewerSettings(PREF.ORG_PAGE, PREF_DEFAULTS[PREF.ORG_PAGE]).settings;
const modelLighting = useViewerSettings(PREF.MODEL_LIGHTING, PREF_DEFAULTS[PREF.MODEL_LIGHTING]).settings;
const unifiedViewer = useViewerSettings(PREF.UNIFIED_VIEWER, PREF_DEFAULTS[PREF.UNIFIED_VIEWER]).settings;

/** @param {Array<string|number>} values @param {(v: any) => string} [label] */
const optionsOf = (values, label = String) => values.map(value => ({ value, label: label(value) }));

const PAGE_SIZES = optionsOf([5, 10, 25, 50, 100]);

/**
 * @param {string} id @param {string} label @param {import('vue').Ref} model @param {Array<{label: string, value: any}>} options
 * @param {{ disabled?: import('vue').Ref<boolean>, hint?: import('vue').Ref<string|null>, filter?: boolean }} [extra]
 *   hint: a line shown under the row; filter: a search box above a long list of options
 */
const select = (id, label, model, options, extra) => ({ id, label, kind: 'select', model, options, ...extra });
/** @param {string} id @param {string} label @param {import('vue').Ref} model @param {{ hint?: import('vue').Ref<string|null> }} [extra] */
const toggle = (id, label, model, extra) => ({ id, label, kind: 'switch', model, ...extra });
/** @param {string} id @param {string} label @param {import('vue').Ref} model @param {number} max @param {Record<string, any>} [extra] */
const range = (id, label, model, max, extra) => ({ id, label, kind: 'range', model, min: 0, max, ...extra });

// A stored value that is not a quality shows as the default, which is what the viewer draws at
const storedQuality = usePreference(PREF.SPLAT_QUALITY, PREF_DEFAULTS[PREF.SPLAT_QUALITY]);
const splatQuality = computed({
    get: () => prefChoice(PREF.SPLAT_QUALITY, storedQuality.value),
    set: value => { storedQuality.value = value; }
});

// A stored sort that is not one the list knows shows as the default, which is what the list uses
const orgSortColumn = computed({
    get: () => orgPageChoice('sortColumn', orgPage.sortColumn),
    set: value => { orgPage.sortColumn = value; }
});
const orgSortDirection = computed({
    get: () => orgPageChoice('sortDirection', orgPage.sortDirection),
    set: value => { orgPage.sortDirection = value; }
});
const SORT_DIRECTION_OPTIONS = [{ value: 'asc', label: 'Ascending' }, { value: 'desc', label: 'Descending' }];

const basemapOptions = Object.entries(Basemaps).map(([value, { label }]) => ({ value, label }));
// "Custom" opens the editor of the custom source, and is stored once a source is saved
const {
    choice: basemapChoice, editingCustom, onApplied: onCustomApplied, onCleared: onCustomCleared
} = useBasemapChoice(usePreference(PREF.BASEMAP, PREF_DEFAULTS[PREF.BASEMAP]));

// A stored value that is not a currency code shows as the default, which is what the views use
const storedCurrency = usePreference(PREF.CURRENCY, PREF_DEFAULTS[PREF.CURRENCY]);
const currency = computed({
    get: () => normalizeCurrency(storedCurrency.value),
    set: value => { storedCurrency.value = normalizeCurrency(value); }
});

// ---- Notifications: e-mail about the user's builds ----

const BUILD_NOTIFICATION_OPTIONS = [
    { value: 'none', label: 'None' },
    { value: 'all', label: 'All' },
    { value: 'failed', label: 'Failed or waiting for files' }
];
/** Why the server cannot e-mail this account, by the status `reason` (emailDisabled hides the tab instead). */
const CANNOT_RECEIVE = {
    noAddress: 'Your account has no e-mail address. Ask an administrator to add one.'
};

/** The answer of /users/notifications/status, once asked. @type {import('vue').Ref<{ canReceiveEmail: boolean, reason: string|null }|null>} */
const notificationStatus = ref(null);
const notificationsShown = computed(() =>
    !!auth.feature(Features.EMAIL_ENABLED) && notificationStatus.value?.reason !== 'emailDisabled');
// Not known yet, or known to be impossible: the setting waits. A failed status request leaves it
// usable, as the server applies the setting only when it can send anyway
const cannotReceive = computed(() => notificationStatus.value?.canReceiveEmail === false);
const notificationsDisabled = computed(() => notificationStatus.value === null || cannotReceive.value);
const notificationsHint = computed(() => (cannotReceive.value
    ? CANNOT_RECEIVE[notificationStatus.value?.reason ?? ''] ?? 'Your account cannot receive e-mail from this server.'
    : 'An e-mail tells you when the builds of your files end, and once when a build waits for files to be uploaded; '
        + 'builds that end close together share one e-mail.'));

let statusAsked = false;
async function loadNotificationStatus() {
    if (statusAsked) return;
    statusAsked = true;
    try {
        notificationStatus.value = await reg.notificationStatus();
    } catch (e) {
        console.warn('The e-mail status of the account could not be read', e);
        notificationStatus.value = { canReceiveEmail: true, reason: null };
    }
}

/**
 * `sections` are the account sections the tab shows: its "Reset section" returns them to the defaults.
 * `shown`, when set, says whether the tab is there.
 */
const TABS = [
    {
        value: 'units', label: 'Units', icon: 'fa-solid fa-ruler', sections: ['units'],
        groups: [{
            controls: [
                select('measurement-units', 'Measurement units', usePreference(PREF.MEASURE_UNIT, PREF_DEFAULTS[PREF.MEASURE_UNIT]),
                    [{ value: 'metric', label: 'Metric' }, { value: 'imperial', label: 'Imperial' }]),
                select('currency', 'Currency', currency, currencyChoices(),
                    { filter: true, hint: ref('Prices are shown in this currency, for example the cost of a stockpile. Changing it does not convert them.') })
            ]
        }]
    },
    {
        value: 'map', label: 'Map', icon: 'fa-solid fa-map', sections: ['map'],
        groups: [{
            controls: [
                select('basemap', 'Default basemap', basemapChoice, basemapOptions),
                toggle('flight-path', 'Show flight path', usePreference(PREF.SHOW_FLIGHT_PATH, PREF_DEFAULTS[PREF.SHOW_FLIGHT_PATH])),
                toggle('direction-indicators', 'Show direction indicators', usePreference(PREF.SHOW_DIRECTION_INDICATORS, PREF_DEFAULTS[PREF.SHOW_DIRECTION_INDICATORS])),
                toggle('dataset-names', 'Show dataset names on the datasets map', usePreference(PREF.LOCATIONS_MAP_NAMES, PREF_DEFAULTS[PREF.LOCATIONS_MAP_NAMES]),
                    { hint: ref('The Map view of the Organizations and Datasets pages.') })
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
                    select('orgs-sort-column', 'Sort organizations by', orgSortColumn, ORG_SORT_OPTIONS),
                    select('orgs-sort-direction', 'Organizations order', orgSortDirection, SORT_DIRECTION_OPTIONS),
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
                        [{ value: 'fly', label: 'Fly' }, { value: 'earth', label: 'Earth' }]),
                    select('splat-quality', 'Quality', splatQuality, QUALITY_CHOICES,
                        { hint: ref('Auto lowers the detail on a slow device and raises it again when there is room.') })
                ]
            },
            {
                title: '3D models lighting',
                controls: [
                    range('model-ambient', 'Ambient', toRef(modelLighting, 'ambientIntensity'), 3),
                    range('model-directional', 'Directional', toRef(modelLighting, 'directionalIntensity'), 3),
                    range('model-shininess', 'Shininess', toRef(modelLighting, 'shininess'), 100, { step: 5, format: String })
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
    },
    {
        value: 'stockpiles', label: 'Stockpiles', icon: 'fa-solid fa-layer-group', sections: ['stockpiles'],
        groups: [{ title: 'Materials', component: StockpileMaterialsEditor }]
    },
    {
        value: 'notifications', label: 'Notifications', icon: 'fa-solid fa-envelope', sections: ['notifications'],
        shown: notificationsShown,
        groups: [{
            title: 'E-mail',
            controls: [
                select('build-notifications', 'Send build notifications',
                    usePreference(PREF.BUILD_NOTIFICATIONS, PREF_DEFAULTS[PREF.BUILD_NOTIFICATIONS]), BUILD_NOTIFICATION_OPTIONS,
                    { disabled: notificationsDisabled, hint: notificationsHint })
            ]
        }]
    }
];

const visibleTabs = computed(() => TABS.filter(tab => !tab.shown || tab.shown.value));

// The tab asked for stays chosen while it is hidden (the feature flags may arrive after the
// window opens): the first tab shows meanwhile, and the chosen one as soon as it is there
const chosenTab = ref(props.initialTab);
// A link to another tab while the window is open
watch(() => props.initialTab, tab => { chosenTab.value = tab; });
const activeTab = computed({
    get: () => (visibleTabs.value.some(tab => tab.value === chosenTab.value) ? chosenTab.value : visibleTabs.value[0].value),
    set: value => { chosenTab.value = value; }
});

watch(activeTab, tab => { if (tab === 'notifications') void loadNotificationStatus(); }, { immediate: true });

// The tab list scrolls when the tabs do not fit the window: a tab opened by a link (or chosen
// before its flag arrived) is brought into view, else it can sit cut off at the edge
// (the window renders its content after it opens, so the tabs mounting is watched too)
const tabsRef = ref(null);
watch([activeTab, tabsRef], () => nextTick(() => tabsRef.value?.$el?.querySelector('[role="tab"][aria-selected="true"]')
    ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })), { flush: 'post' });

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
    /* The padding is the panel's, inside what scrolls: a scroller with a top padding has a band
       above its content that the rows scroll through, and a sticky title (the stockpile
       materials) sticks below that band, not at the visible edge */
    padding: 0;
}

.pref-tabs :deep(.p-tabpanel) {
    padding: var(--p-tabs-tabpanel-padding);
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

/* 17rem when there is room (the longest option, "Failed or waiting for files", fits); narrower
   (never past the panel edge) on a phone */
.pref-select {
    flex: 0 1 17rem;
    min-width: 0;
}

.pref-hint {
    margin: 0 0 0.75rem 0;
    font-size: var(--ddb-font-size-sm);
    color: var(--ddb-text-secondary);
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
