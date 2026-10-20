<template>
    <Window id="feature-info" :title="title" modal close-modal-on-click max-width="70%" fixed-size @close="close('close')">
        <div class="feature-info-content">
            <template v-for="(categoryProps, category) in categorizedProperties" :key="category">
                <div v-if="categoryProps && Object.keys(categoryProps).length > 0" class="category-section">
                    <h3 class="category-title">{{ category }}</h3>
                    <table class="properties-table">
                        <tr v-for="(value, key) in categoryProps" :key="key">
                            <td class="property-name">{{ key }}</td>
                            <td class="property-value">
                                <div v-if="value === null || value === undefined" class="empty-value"><i>(Empty)</i></div>
                                <div v-else-if="isDateString(value)" class="date-value">{{ formatDate(value) }}</div>
                                <ObjTable v-else-if="isComplex(value)" :obj="parseComplexValue(value)" />
                                <div v-else class="plain-value">{{ value }}</div>
                            </td>
                        </tr>
                    </table>
                </div>
            </template>
        </div>

        <div class="text-end mt-3">
            <Button severity="secondary" label="Close" @click="close('close')" />
        </div>
    </Window>
</template>

<script>
import Window from '@/components/Window.vue';
import ObjTable from '@/components/ObjTable.vue';
import Button from 'primevue/button';
import { formatDateTime } from '@/libs/format';

export default {
    components: {
        Window,
        ObjTable,
        Button
    },

    props: {
        title: {
            type: String,
            default: "Feature Properties"
        },
        properties: {
            type: Object,
            required: true
        }
    },
    emits: ['close'],

    data: function () {
        return {
            // Group categories for properties
            categoryGroups: {
                'Identification': ['id', 'name', 'label', 'title', 'description'],
                'Classification': ['class', 'type', 'category', 'layer', 'classification'],
                'Geometry': ['height', 'width', 'length', 'area', 'volume', 'radius'],
                'Address': ['address', 'street', 'city', 'country', 'postal_code', 'postcode', 'zip'],
                'Other': []
            }
        };
    },

    computed: {
        categorizedProperties() {
            const result = {};

            // Initialize categories
            for (const category in this.categoryGroups) {
                result[category] = {};
            }

            if (!this.properties || typeof this.properties !== 'object') return result;

            // Assign properties to categories
            for (const key in this.properties) {
                let assigned = false;

                // Check if property belongs to any category
                for (const category in this.categoryGroups) {
                    if (this.categoryGroups[category].some(prop =>
                        key.toLowerCase().includes(prop.toLowerCase())
                    )) {
                        result[category][key] = this.properties[key];
                        assigned = true;
                        break;
                    }
                }

                // If not assigned to any category, put in "Other"
                if (!assigned) {
                    result['Other'][key] = this.properties[key];
                }
            }

            return result;
        }
    },

    methods: {
        close: function (buttonId) {
            this.$emit('close', buttonId);
        },

        formatValue: function(value) {
            if (value === null || value === undefined) {
                return '-';
            } else if (typeof value === 'object') {
                return JSON.stringify(value);
            }
            return value;
        },

        isComplex: function(value) {
            // Check if it's already an object
            if (typeof value === 'object' && value !== null) {
                return true;
            }

            // Check if it's a string containing JSON (array or object)
            if (typeof value === 'string') {
                value = value.trim();
                if ((value.startsWith('{') && value.endsWith('}')) ||
                    (value.startsWith('[') && value.endsWith(']'))) {
                    try {
                        const parsed = JSON.parse(value);
                        return typeof parsed === 'object' && parsed !== null;
                    } catch {
                        // Not valid JSON
                        return false;
                    }
                }
            }

            return false;
        },

        parseComplexValue: function(value) {
            if (typeof value === 'object') {
                return value;
            }

            if (typeof value === 'string') {
                try {
                    return JSON.parse(value);
                } catch {
                    console.warn('Failed to parse complex value:', value);
                    return value;
                }
            }

            return value;
        },

        isDateString: function(value) {
            if (typeof value !== 'string') return false;

            // ISO date format regex check (YYYY-MM-DDTHH:MM:SS.sssZ)
            const isoDatePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/;
            if (isoDatePattern.test(value)) {
                // Verify that parsing actually works and returns a valid date
                const date = new Date(value);
                return !isNaN(date.getTime());
            }

            return false;
        },

        formatDate(value) {
            return formatDateTime(value, { seconds: true });
        }
    }
}
</script>

<style scoped>
.feature-info-content {
    max-height: 25rem;
    overflow-y: auto;
    padding: 0.25rem;
}

.category-title {
    margin: 0.75rem 0 0.25rem 0;
    font-size: var(--ddb-font-size-base);
    font-weight: bold;
    color: var(--ddb-text);
}

.properties-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: var(--ddb-spacing-lg);
}

.property-name {
    padding: var(--ddb-spacing-xs);
    text-align: left;
    border-bottom: var(--ddb-border-width) solid var(--ddb-border);
    font-weight: bold;
    width: 30%;
}

.property-value {
    padding: var(--ddb-spacing-xs);
    text-align: left;
    border-bottom: var(--ddb-border-width) solid var(--ddb-border);
    word-break: break-word;
}

/* Style adjustments for nested tables */
.property-value :deep(.ui.table) {
    margin-top: 0;
    margin-bottom: 0;
    border: none;
}

.property-value :deep(.ui.table td:first-child) {
    width: 7.5rem;
}
</style>
