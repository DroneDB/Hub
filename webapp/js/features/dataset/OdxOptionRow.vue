/**
 * OdmOptionRow - Single NodeODX processing option row.
 *
 * Renders the appropriate input control based on option type (bool, enum,
 * string, int, float, json). Shows help tooltip, reset button, and warning
 * for dangerous options.
 *
 * Props:
 *   option - Option object with name, type, domain, help, defaultValue, value
 */
<template>
    <div class="odm-option-row">
        <div class="odm-option-label">
            <span :id="labelId" class="odm-option-name">{{ option.name }}</span>
            <span v-if="domainLabel" class="odm-option-domain">({{ domainLabel }})</span>
            <i v-if="interpolatedHelp" v-tooltip.bottom="interpolatedHelp"
               class="fa-solid fa-circle-info odm-option-help" aria-hidden="true" />
            <span v-if="interpolatedHelp" :id="helpId" class="visually-hidden">{{ interpolatedHelp }}</span>
        </div>

        <div class="odm-option-control">
            <!-- Boolean: checkbox -->
            <Checkbox v-if="option.type === 'bool'" :model-value="localValue" :binary="true" :aria-labelledby="labelId" :aria-describedby="helpId"
                      @update:model-value="onInput" />

            <!-- Enum: select dropdown -->
            <Select v-else-if="isEnum" :model-value="localValue" :aria-labelledby="labelId" :aria-describedby="helpId" :options="enumChoices"
                    option-label="label" option-value="value" class="w-100" @update:model-value="onInput" />

            <!-- JSON: textarea with file import -->
            <Textarea v-else-if="option.type === 'json'" :model-value="localValue" :aria-labelledby="labelId" :aria-describedby="helpId" rows="2"
                      placeholder="Paste JSON..." class="w-100" @update:model-value="onInput" />

            <!-- String, int, float: text input -->
            <InputText v-else :model-value="localValue" :aria-labelledby="labelId" :aria-describedby="helpId" :placeholder="option.defaultValue ?? ''" class="w-100"
                       @update:model-value="onInput" />
        </div>

        <div class="odm-option-actions">
            <Button v-if="hasChanged" type="button" severity="secondary" text icon="fa-solid fa-rotate-left"
                    class="odm-reset-btn" :aria-label="`Reset ${option.name} to default`" @click="resetToDefault" />
        </div>

        <div v-if="showWarning" class="odm-option-warning">
            <i class="fa-solid fa-triangle-exclamation" /> {{ warningText }}
        </div>
    </div>
</template>

<script>
import Checkbox from 'primevue/checkbox';
import Select from 'primevue/select';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import Button from 'primevue/button';
import Tooltip from 'primevue/tooltip';
import { useId } from 'vue';

const warnings = {
    'ignore-gsd': 'You might run out of memory if you use this option.'
};

export default {
    name: 'OdxOptionRow',

    components: { Checkbox, Select, InputText, Textarea, Button },

    directives: { tooltip: Tooltip },

    props: {
        option: { type: Object, required: true }
    },

    emits: ['update:value'],

    setup() {
        return { labelId: useId() };
    },

    data() {
        return {
            localValue: this.option.value !== undefined ? this.option.value : ''
        };
    },

    computed: {
        // The option name labels the control, its help describes it (the tooltip is mouse-only)
        helpId() {
            return this.interpolatedHelp ? this.labelId + '-help' : undefined;
        },
        isEnum() {
            return this.option.type === 'enum' && Array.isArray(this.option.domain);
        },
        enumChoices() {
            if (!Array.isArray(this.option.domain)) return [];
            return this.option.domain.map(v => ({ label: v, value: v }));
        },
        domainLabel() {
            if (this.isEnum) return null;
            return typeof this.option.domain === 'string' ? this.option.domain : null;
        },
        interpolatedHelp() {
            let h = this.option.help || '';
            if (!h) return '';
            const choices = Array.isArray(this.option.domain)
                ? this.option.domain.join(', ')
                : (this.option.domain || '');
            const def = this.option.defaultValue ?? '';
            // NodeODX help uses Python printf-style %(choices)s / %(default)s;
            // also support {choices} / {default} for robustness.
            h = h.replace(/%\(choices\)s/g, choices).replace(/\{choices\}/g, choices);
            h = h.replace(/%\(default\)s/g, def).replace(/\{default\}/g, def);
            return h;
        },
        hasChanged() {
            return this.localValue !== '' && this.localValue !== this.option.defaultValue;
        },
        showWarning() {
            return !!warnings[this.option.name] && this.localValue !== '';
        },
        warningText() {
            return warnings[this.option.name] || '';
        }
    },

    watch: {
        // The profile or the editor changed the value: the control follows, and nothing is emitted (FR-PRC-07): only
        // what the user does is a customization, a value that a profile sets is not
        'option.value'(val) {
            this.localValue = val !== undefined ? val : '';
        }
    },

    methods: {
        // The user changed the control
        onInput(value) {
            this.localValue = value;
            this.$emit('update:value', value);
        },
        resetToDefault() {
            this.onInput('');
        }
    }
};
</script>

<style scoped>
.odm-option-row {
    padding: 0.4rem 0;
    border-bottom: 1px solid var(--ddb-border);
}

.odm-option-label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-bottom: 0.25rem;
}

.odm-option-name {
    font-family: monospace;
    font-weight: 600;
    font-size: 0.85rem;
}

.odm-option-domain {
    color: var(--ddb-text-muted);
    font-size: 0.8rem;
}

.odm-option-help {
    color: var(--ddb-primary);
    cursor: pointer;
    font-size: 0.85rem;
}

.odm-option-control {
    margin-left: 1.5rem;
    margin-bottom: 0.25rem;
}

.odm-option-actions {
    margin-left: 1.5rem;
}

.odm-reset-btn {
    padding: 0.2rem 0.4rem;
    font-size: 0.8rem;
}

.odm-option-warning {
    margin-left: 1.5rem;
    margin-top: 0.25rem;
    padding: 0.3rem 0.5rem;
    background: var(--ddb-warning-bg);
    border: 1px solid var(--ddb-warning);
    border-radius: 4px;
    color: var(--ddb-warning-text);
    font-size: 0.8rem;
    display: flex;
    align-items: center;
    gap: 0.3rem;
}
</style>
