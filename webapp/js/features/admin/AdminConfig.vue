<template>
    <div id="admin-config" class="admin-config-page">

        <div class="top-banner d-flex flex-wrap justify-content-between align-items-center gap-2">
            <div>
                <h1>Configuration</h1>
            </div>
            <div class="d-flex flex-wrap gap-2">
                <Button severity="secondary" icon="fa-solid fa-rotate-left" label="Reset to Defaults"
                        :disabled="loading" @click="resetToDefaults" />
                <Button severity="primary" icon="fa-solid fa-copy" label="Copy AppSettings JSON"
                        :disabled="loading" @click="copyToClipboard" />
            </div>
        </div>

        <LoadingSpinner v-if="loading" size="lg" label="Loading configuration..." />

        <div v-else class="config-scroll-container">
            <UsageAndContactCard />
            <EmailTemplatesCard />

            <Accordion :active-index="activeIndex" class="config-accordion">
                <!-- The header is named by the section title alone (the Custom/Default tag describes it) -->
                <AccordionTab v-for="(section, sIdx) in sections" :key="sIdx"
                              :pt="{ header: { 'aria-label': section.title, 'aria-describedby': `config-section-state-${sIdx}` } }">
                    <template #header>
                        <span class="section-header">
                            {{ section.title }}
                            <Tag v-if="isSectionActive(sIdx)" :id="`config-section-state-${sIdx}`" value="Custom" severity="info" size="small" class="ms-2" />
                            <Tag v-else :id="`config-section-state-${sIdx}`" value="Default" severity="secondary" size="small" class="ms-2" />
                        </span>
                    </template>
                    <div :class="['config-section-content', isSectionActive(sIdx) ? '' : 'config-section-inactive']">
                        <p class="section-description">{{ section.description }}</p>

                        <div class="config-fields-grid">
                            <div v-for="(field, fIdx) in section.fields" :key="fIdx"
                                 class="config-field">
                                <div class="field-header">
                                    <label :for="`field-${sIdx}-${fIdx}`">{{ field.displayName }}</label>
                                    <div class="field-tags">
                                        <Tag v-if="isInfoField(field)" value="Read-only" severity="secondary" size="small" />
                                        <Tag v-else-if="field.sensitive && isFieldModified(sIdx, fIdx)"
                                             value="Modified" severity="info" size="small" />
                                        <Tag v-else-if="field.sensitive && field.isSet"
                                             value="Set (masked)" severity="info" size="small" />
                                        <Tag v-else-if="field.sensitive && !field.isSet"
                                             value="Not set" severity="secondary" size="small" />
                                        <Tag v-else-if="isFieldModified(sIdx, fIdx)"
                                             value="Modified" severity="info" size="small" />
                                        <Tag v-else value="Default" severity="success" size="small" />
                                    </div>
                                </div>

                                <!-- info: shown, not a setting -->
                                <InputText v-if="isInfoField(field)"
                                           :id="`field-${sIdx}-${fIdx}`"
                                           :model-value="field.currentValue"
                                           readonly class="info-value" />

                                <!-- text -->
                                <InputText v-else-if="field.fieldType === 'text' && !field.sensitive"
                                           :id="`field-${sIdx}-${fIdx}`"
                                           :model-value="getFieldValue(sIdx, fIdx, field)"
                                           :pt="{ root: { class: fieldInputClass(sIdx, fIdx) } }"
                                           @update:model-value="onFieldChange(sIdx, fIdx, $event)" />

                                <!-- password / sensitive -->
                                <template v-else-if="field.fieldType === 'password' || field.sensitive">
                                    <div v-if="!isFieldModified(sIdx, fIdx)" class="sensitive-display">
                                        <span v-if="field.isSet" class="sensitive-set">
                                            <i class="fa-solid fa-lock me-1" /> (set, masked)
                                        </span>
                                        <span v-else class="sensitive-not-set">
                                            <i class="fa-solid fa-lock-open me-1" /> (not set)
                                        </span>
                                        <Button severity="secondary" size="small"
                                                text class="ms-2" @click="onSensitiveChange(sIdx, fIdx)">Change</Button>
                                    </div>
                                    <Password v-else :id="`field-${sIdx}-${fIdx}`"
                                              :model-value="getFieldValue(sIdx, fIdx, field)"
                                              :feedback="false"
                                              toggle-mask placeholder="Enter value..."
                                              :pt="{ root: { class: fieldInputClass(sIdx, fIdx) } }"
                                              @update:model-value="onFieldChange(sIdx, fIdx, $event)" />
                                </template>

                                <!-- number -->
                                <div v-else-if="field.fieldType === 'number'" class="number-input-wrapper">
                                    <InputNumber :id="`field-${sIdx}-${fIdx}`"
                                                 :model-value="getFieldNumber(sIdx, fIdx, field)"
                                                 :min="field.minValue"
                                                 :max="field.maxValue" mode="decimal"
                                                 :use-grouping="false" :pt="{ root: { class: fieldInputClass(sIdx, fIdx) } }"
                                                 @update:model-value="onFieldChange(sIdx, fIdx, $event)" />
                                    <span v-if="field.unit" class="input-unit">{{ field.unit }}</span>
                                </div>

                                <!-- bool -->
                                <ToggleSwitch v-else-if="field.fieldType === 'bool'"
                                              :id="`field-${sIdx}-${fIdx}`"
                                              :model-value="getFieldBool(sIdx, fIdx, field)"
                                              @update:model-value="onFieldChange(sIdx, fIdx, $event)" />

                                <!-- enum -->
                                <Select v-else-if="field.fieldType === 'enum'"
                                        :id="`field-${sIdx}-${fIdx}`"
                                        :model-value="getFieldValue(sIdx, fIdx, field)"
                                        :options="field.enumOptions"
                                        :pt="{ root: { class: fieldInputClass(sIdx, fIdx) } }"
                                        @update:model-value="onFieldChange(sIdx, fIdx, $event)" />

                                <!-- timespan -->
                                <div v-else-if="field.fieldType === 'timespan'" class="timespan-input-wrapper">
                                    <InputText :id="`field-${sIdx}-${fIdx}`"
                                               :model-value="getFieldValue(sIdx, fIdx, field)"
                                               placeholder="dd:hh:mm:ss"
                                               :pt="{ root: { class: fieldInputClass(sIdx, fIdx) } }"
                                               @update:model-value="onFieldChange(sIdx, fIdx, $event)" />
                                    <small class="timespan-hint">Format: dd:hh:mm:ss (e.g. 00:30:00 = 30 min)</small>
                                </div>

                                <!-- cron -->
                                <div v-else-if="field.fieldType === 'cron'" class="cron-input-wrapper">
                                    <InputText :id="`field-${sIdx}-${fIdx}`"
                                               :model-value="getFieldValue(sIdx, fIdx, field)"
                                               placeholder="0 * * * *"
                                               :pt="{ root: { class: fieldInputClass(sIdx, fIdx) } }"
                                               @update:model-value="onFieldChange(sIdx, fIdx, $event)" />
                                    <small class="cron-hint">
                                        Cron expression. Validate at
                                        <a href="https://crontab.guru" target="_blank" rel="noopener">crontab.guru</a>
                                    </small>
                                </div>

                                <!-- array -->
                                <Chips v-else-if="field.fieldType === 'array'"
                                       :id="`field-${sIdx}-${fIdx}`"
                                       :model-value="getFieldArray(sIdx, fIdx, field)"
                                       @update:model-value="onFieldChange(sIdx, fIdx, $event)" />

                                <!-- json (fallback) -->
                                <Textarea v-else
                                          :id="`field-${sIdx}-${fIdx}`"
                                          :model-value="getFieldValue(sIdx, fIdx, field)"
                                          :rows="3"
                                          :pt="{ root: { class: fieldInputClass(sIdx, fIdx) } }"
                                          @update:model-value="onFieldChange(sIdx, fIdx, $event)" />

                                <small class="field-description">{{ field.description }}</small>
                            </div>
                        </div>

                        <div class="section-actions mt-3">
                            <Button severity="secondary" size="small" icon="fa-solid fa-rotate-left"
                                    label="Reset Section" @click="resetSection(sIdx)" />
                        </div>
                    </div>
                </AccordionTab>
            </Accordion>
        </div>
    </div>
</template>

<script>
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import EmailTemplatesCard from '@/features/admin/EmailTemplatesCard.vue';
import UsageAndContactCard from '@/features/admin/UsageAndContactCard.vue';
import reg from '@/libs/api/sharedRegistry';
import Accordion from 'primevue/accordion';
import AccordionTab from 'primevue/accordiontab';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import ToggleSwitch from 'primevue/toggleswitch';
import Select from 'primevue/select';
import Password from 'primevue/password';
import Chips from 'primevue/chips';
import Textarea from 'primevue/textarea';
import Tag from 'primevue/tag';
import { copyText } from '@/composables/useCopyText';
import { isForbidden } from '@/libs/ddb/apiError';
import { settingPath, setSettingAt } from '@/libs/appSettingsJson';

/**
 * Admin Configuration Editor - inspect all Registry config fields grouped by
 * section, with typed inputs and JSON generation for appsettings.json.
 */
export default {
    name: 'AdminConfig',

    components: {
        LoadingSpinner, UsageAndContactCard, EmailTemplatesCard,
        Accordion, AccordionTab, Button, InputText, InputNumber,
        ToggleSwitch, Select, Password, Chips, Textarea, Tag
    },

    data() {
        return {
            sections: [],
            // The page loads on mount: the cards below the spinner are mounted once, after the load
            loading: true,
            activeIndex: [0],
            // Map<"sIdx-fIdx", newValue>
            modifiedFields: {},
            // Set of section indices that became active due to editing
            modifiedSections: {}
        };
    },

    async mounted() {
        await this.loadConfig();
    },

    methods: {
        async loadConfig() {
            this.loading = true;
            try {
                const data = await reg.sys.config();
                this.sections = data.sections || [];
            } catch (e) {
                console.error('Failed to load config:', e);
                if (isForbidden(e)) {
                    this.$router.push({ name: 'Organizations' }).catch(() => { });
                    return;
                }
            } finally {
                this.loading = false;
            }
        },

        // ---- state helpers ----

        // A value the server shows (an identifier) that is not in appsettings.json
        isInfoField(field) {
            return field.fieldType === 'info';
        },

        isSectionActive(sIdx) {
            return this.sections[sIdx]?.isActive || !!this.modifiedSections[sIdx];
        },

        isFieldModified(sIdx, fIdx) {
            const key = sIdx + '-' + fIdx;
            return key in this.modifiedFields;
        },

        getFieldValue(sIdx, fIdx, field) {
            const key = sIdx + '-' + fIdx;
            if (key in this.modifiedFields) return this.modifiedFields[key];
            return field.currentValue;
        },

        getFieldNumber(sIdx, fIdx, field) {
            const key = sIdx + '-' + fIdx;
            if (key in this.modifiedFields) return this.modifiedFields[key];
            const val = field.currentValue;
            return val !== null && val !== undefined ? Number(val) : null;
        },

        getFieldBool(sIdx, fIdx, field) {
            const key = sIdx + '-' + fIdx;
            if (key in this.modifiedFields) return this.modifiedFields[key];
            return field.currentValue === 'True';
        },

        getFieldArray(sIdx, fIdx, field) {
            const key = sIdx + '-' + fIdx;
            if (key in this.modifiedFields) return this.modifiedFields[key];
            const val = field.currentValue;
            if (!val) return [];
            return val.split(',').map(s => s.trim()).filter(Boolean);
        },

        // ---- field change handler ----

        onFieldChange(sIdx, fIdx, newValue) {
            const key = sIdx + '-' + fIdx;
            if (newValue === undefined || newValue === null) {
                delete this.modifiedFields[key];
            } else {
                this.modifiedFields[key] = newValue;
            }
            this.modifiedSections[sIdx] = true;
        },

        onSensitiveChange(sIdx, fIdx) {
            const key = sIdx + '-' + fIdx;
            this.modifiedFields[key] = '';
            this.modifiedSections[sIdx] = true;
        },

        // ---- input styling ----

        fieldInputClass(sIdx, fIdx) {
            if (this.isFieldModified(sIdx, fIdx)) return 'p-field-modified';
            return '';
        },

        // ---- reset ----

        resetToDefaults() {
            this.modifiedFields = {};
            this.modifiedSections = {};
            this.$notify.info('All fields restored to defaults.', { summary: 'Reset' });
        },

        resetSection(sIdx) {
            // Remove all modified fields in this section
            const keysToRemove = Object.keys(this.modifiedFields).filter(k => k.startsWith(sIdx + '-'));
            keysToRemove.forEach(k => delete this.modifiedFields[k]);
            delete this.modifiedSections[sIdx];
            this.$notify.info('Section restored to defaults.', { summary: 'Reset Section' });
        },

        // ---- JSON generation ----

        // The settings in the shape of appsettings.json: AppSettings, and ConnectionStrings and
        // Serilog next to it (see libs/appSettingsJson.js)
        generateAppSettingsJson() {
            const obj = {};

            for (let sIdx = 0; sIdx < this.sections.length; sIdx++) {
                const section = this.sections[sIdx];

                for (let fIdx = 0; fIdx < section.fields.length; fIdx++) {
                    const field = section.fields[fIdx];
                    if (this.isInfoField(field)) continue;
                    const key = sIdx + '-' + fIdx;
                    const isModified = key in this.modifiedFields;

                    // Determine the value to use
                    let rawValue;
                    if (field.sensitive) {
                        if (isModified && this.modifiedFields[key] !== '') {
                            rawValue = this.modifiedFields[key];
                        } else if (field.isSet) {
                            rawValue = '<CHANGE-ME>';
                        } else {
                            continue; // not set and not modified -> skip
                        }
                    } else if (isModified) {
                        rawValue = this.modifiedFields[key];
                    } else {
                        rawValue = field.currentValue;
                    }

                    // Convert to proper type
                    let value;
                    switch (field.fieldType) {
                        case 'number':
                            value = rawValue === null || rawValue === '' ? null : Number(rawValue);
                            break;
                        case 'bool':
                            value = rawValue === 'True' || rawValue === true;
                            break;
                        case 'array':
                            value = Array.isArray(rawValue) ? rawValue :
                                (typeof rawValue === 'string' ? rawValue.split(',').map(s => s.trim()).filter(Boolean) : []);
                            break;
                        case 'json':
                            // Parse the JSON text into an object so it serializes as structured JSON.
                            try {
                                value = typeof rawValue === 'string' && rawValue.trim()
                                    ? JSON.parse(rawValue)
                                    : null;
                            } catch {
                                value = rawValue; // keep raw (invalid) text visible for the admin to fix
                            }
                            break;
                        case 'timespan':
                            value = rawValue || null;
                            break;
                        default:
                            value = rawValue;
                            break;
                    }

                    // Skip null/empty values that match defaults
                    if (value === null || value === '') {
                        if (!field.sensitive && field.defaultValue === rawValue) continue;
                    }

                    setSettingAt(obj, settingPath(section.name, field.key), value);
                }
            }

            return JSON.stringify(obj, null, 2);
        },

        copyToClipboard() {
            copyText(this.generateAppSettingsJson()).then(() => {
                this.$notify.success('AppSettings JSON copied to clipboard.', { summary: 'Copied' });
            }).catch(() => {
                this.$notify.error('Failed to copy to clipboard.', { life: 'short' });
            });
        }
    }
};
</script>

<style scoped>
.admin-config-page {
    padding: var(--ddb-spacing-lg);
    box-sizing: border-box;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.config-scroll-container {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
}

.config-accordion {
    margin-top: 1rem;
}

.section-header {
    display: inline-flex;
    align-items: center;
    font-weight: 600;
}

.section-description {
    color: var(--ddb-text-secondary);
    font-style: italic;
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--ddb-border);
}

.config-section-inactive {
    opacity: 0.5;
    filter: grayscale(30%);
}

.config-fields-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(380px, 100%), 1fr));
    gap: 1.5rem;
}

.config-field {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
}

.field-header {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 0.25rem;
}

.field-header label {
    font-weight: 600;
    font-size: 0.9rem;
}

.field-tags {
    display: flex;
    gap: 0.25rem;
}

.field-description {
    color: var(--ddb-text-secondary);
    font-size: 0.8rem;
    line-height: 1.3;
}

.info-value {
    font-family: monospace;
}

.sensitive-display {
    display: flex;
    align-items: center;
    color: var(--ddb-text-secondary);
    font-size: 0.85rem;
}

.sensitive-set {
    color: var(--ddb-primary);
}

.sensitive-not-set {
    color: var(--ddb-text-secondary);
}

.number-input-wrapper,
.timespan-input-wrapper,
.cron-input-wrapper {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.input-unit {
    font-size: 0.8rem;
    color: var(--ddb-text-secondary);
    white-space: nowrap;
}

.timespan-hint,
.cron-hint {
    display: block;
    color: var(--ddb-text-secondary);
    font-size: 0.75rem;
    margin-top: 0.15rem;
}

.cron-hint a {
    color: var(--ddb-primary);
    text-decoration: underline;
}

.p-field-modified {
    border-color: var(--ddb-warning) !important;
}

.section-actions {
    border-top: 1px solid var(--ddb-border);
    padding-top: 1rem;
}

.loading {
    color: var(--ddb-text-secondary);
}
</style>
