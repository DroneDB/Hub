<template>
    <Window :title="title" id="feature-info" @onClose="close('close')" modal maxWidth="70%" fixedSize>
        <div class="feature-info-content">
            <div v-for="(categoryProps, category) in categorizedProperties" :key="category" class="category-section" v-if="Object.keys(categoryProps).length > 0">
                <h3 class="category-title">{{ category }}</h3>
                <table class="properties-table">
                    <tr v-for="(value, key) in categoryProps" :key="key">
                        <td class="property-name">{{ key }}</td>
                        <td class="property-value">
                            <div class="empty-value" v-if="value === null || value === undefined"><i>(Empty)</i></div>
                            <div class="date-value" v-else-if="isDateString(value)">{{ formatDate(value) }}</div>
                            <ObjTable v-else-if="isComplex(value)" :obj="parseComplexValue(value)"></ObjTable>
                            <div class="plain-value" v-else>{{ value }}</div>
                        </td>
                    </tr>
                </table>
            </div>
        </div>

        <div class="buttons">
            <button @click="close('close')" class="ui button">
                Close
            </button>
        </div>
    </Window>
</template>

<script>
import Window from './Window.vue';
import ObjTable from './ObjTable.vue';

export default {
    components: {
        Window,
        ObjTable
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
            this.$emit('onClose', buttonId);
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
                    } catch (e) {
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
                } catch (e) {
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
        
        formatDate: function(dateString) {
            const date = new Date(dateString);
            return new Intl.DateTimeFormat(undefined, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            }).format(date);
        }
    }
}
</script>

<style scoped>
.feature-info-content {
    max-height: 400px;
    overflow-y: auto;
    padding: 5px;
}

.category-title {
    margin: 10px 0 5px 0;
    font-size: 14px;
    font-weight: bold;
    color: #333;
}

.properties-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 15px;
}

.property-name {
    padding: 5px;
    text-align: left;
    border-bottom: 1px solid #ddd;
    font-weight: bold;
    width: 30%;
}

.property-value {
    padding: 5px;
    text-align: left;
    border-bottom: 1px solid #ddd;
    word-break: break-word;
}

/* Style adjustments for nested tables */
.property-value :deep(.ui.table) {
    margin-top: 0;
    margin-bottom: 0;
    border: none;
}

.property-value :deep(.ui.table td:first-child) {
    width: 120px;
}

.buttons {
    margin-top: 16px;
    text-align: right;
}
</style>