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
            <span class="odm-option-name">{{ option.name }}</span>
            <span v-if="domainLabel" class="odm-option-domain">({{ domainLabel }})</span>
            <Tooltip v-if="interpolatedHelp" :value="interpolatedHelp" position="bottom">
                <i class="fa-solid fa-circle-info odm-option-help" />
            </Tooltip>
        </div>

        <div class="odm-option-control">
            <!-- Boolean: checkbox -->
            <Checkbox v-if="option.type === 'bool'" v-model="localValue" :binary="true" />

            <!-- Enum: select dropdown -->
            <Select v-else-if="isEnum" v-model="localValue" :options="enumChoices" class="w-100" />

            <!-- JSON: textarea with file import -->
            <Textarea v-else-if="option.type === 'json'" v-model="localValue" rows="2"
                placeholder="Paste JSON..." class="w-100" />

            <!-- String, int, float: text input -->
            <InputText v-else v-model="localValue" :placeholder="option.defaultValue ?? ''" class="w-100" />
        </div>

        <div class="odm-option-actions">
            <Button v-if="hasChanged" type="button" severity="secondary" text @click="resetToDefault"
                icon="fa-solid fa-rotate-left" class="odm-reset-btn" />
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

const warnings = {
    'ignore-gsd': 'You might run out of memory if you use this option.'
};

export default {
    name: 'OdxOptionRow',

    components: { Checkbox, Select, InputText, Textarea, Button, Tooltip },

    props: {
        option: { type: Object, required: true }
    },

    emits: ['update:value'],

    data() {
        return {
            localValue: this.option.value !== undefined ? this.option.value : ''
        };
    },

    computed: {
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
            h = h.replace(/\{choices\}/g, choices);
            h = h.replace(/\{default\}/g, this.option.defaultValue ?? '');
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
        localValue(val) {
            this.$emit('update:value', val);
        },
        'option.value'(val) {
            this.localValue = val !== undefined ? val : '';
        }
    },

    methods: {
        resetToDefault() {
            this.localValue = '';
        }
    }
};
</script>

<style scoped>
.odm-option-row {
    padding: 0.4rem 0;
    border-bottom: 1px solid var(--ddb-border, #dee2e6);
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
    color: var(--ddb-text-muted, #888);
    font-size: 0.8rem;
}

.odm-option-help {
    color: var(--ddb-primary, #0d6efd);
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
    background: #fff3cd;
    border: 1px solid #ffc107;
    border-radius: 4px;
    color: #856404;
    font-size: 0.8rem;
    display: flex;
    align-items: center;
    gap: 0.3rem;
}
</style>
