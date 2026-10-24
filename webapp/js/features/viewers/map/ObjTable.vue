<template>
    <div>
        <ul v-if="Array.isArray(tObj)">
            <li v-for="(item, index) in tObj" :key="index">
                <ObjTable :obj="item" />
            </li>
        </ul>
        <div v-else-if="tObj !== null && typeof tObj === 'object'">
            <table class="ui compact celled definition unstackable table">
                <tbody>
                    <tr v-for="(val, key) in tObj" :key="key">
                        <td style="white-space: nowrap;">
                            {{ beautify(key) }}
                        </td>
                        <td>
                            <div v-if="key === 'captureTime' && val">
                                {{ new Date(val) }}
                            </div>
                            <div v-else-if="key === 'bands' && Array.isArray(val)">
                                {{ val.map(b => b && b.colorInterp ? b.colorInterp : '').join(", ") }}
                            </div>
                            <div v-else-if="key === 'dimensions' && Array.isArray(val)">
                                {{ val.join(", ") }}
                            </div>
                            <div v-else-if="typeof val === 'boolean' && val" class="bool-true" title="true">✓</div>
                            <div v-else-if="typeof val === 'boolean'" class="bool-false" title="false">✗</div>
                            <div v-else-if="val !== null && typeof val === 'string'" class="wrap">
                                <a v-if="isUrl(val)" :href="val" target="_blank" rel="noopener noreferrer">{{ val }}</a>
                                <template v-else>{{ val }}</template>
                            </div>
                            <ObjTable v-else-if="val !== null" :obj="val" />
                            <span v-else>-</span>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
        <div v-else-if="typeof tObj === 'number'">
            {{ tObj.toLocaleString() }}
        </div>
        <div v-else>
            {{ tObj !== undefined && tObj !== null ? tObj : '-' }}
        </div>
    </div>
</template>

<script>
import { clone, sortObjectKeys } from '@/libs/utils';
import { tidyProperties, beautifyKey, isUrl } from '@/libs/propertiesUtils';
/**
 * ObjTable - Recursive JSON/object-to-HTML-table renderer (legacy Semantic UI style).
 *
 * Handles nested objects and arrays by mounting itself recursively. Formats
 * known special keys (captureTime, bands, dimensions) for readability.
 *
 * Props:
 *   obj - The value to render (any JSON-compatible type).
 */
export default {
    name: 'ObjTable',
    components: {
        ObjTable: () => import('./ObjTable.vue')
    },
    props: {
        obj: {
            type: [Object, Array],
            required: true
        }
    },
    data() {
        return {
            tObj: null
        };
    },
    watch: {
        obj: {
            handler() {
                this.processObject();
            },
            deep: true
        }
    },
    created() {
        this.processObject();
    },
    methods: {
        processObject() {
            try {
                // Handle null or undefined input
                if (this.obj === null || this.obj === undefined) {
                    this.tObj = null;
                    return;
                }

                let tObj = clone(this.obj);

                if (tObj !== null && typeof tObj === 'object') {
                    tObj = sortObjectKeys(tidyProperties(tObj));
                }

                this.tObj = tObj;
            } catch (error) {
                console.error("Error processing object in ObjTable:", error);
                this.tObj = { error: "Error displaying data" };
            }
        },
        beautify: beautifyKey,
        isUrl
    }
}
</script>

<style scoped>
ul {
    margin: 0;
    padding-left: 1rem;
}

.bool-true {
    color: var(--ddb-success);
    font-weight: bold;
}

.bool-false {
    color: var(--ddb-danger);
    font-weight: bold;
}

.wrap {
    word-wrap: break-word;
    word-break: break-all;
    white-space: normal;
}
</style>