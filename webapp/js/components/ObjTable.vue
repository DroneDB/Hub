<template>
    <div>
        <ul v-if="Array.isArray(tObj)">
            <li v-for="(item, index) in tObj" :key="index">
                <ObjTable :obj="item"></ObjTable>
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
                                {{val.map(b => b && b.colorInterp ? b.colorInterp : '').join(", ")}}
                            </div>
                            <div v-else-if="key === 'dimensions' && Array.isArray(val)">
                                {{ val.join(", ") }}
                            </div>
                            <div v-else-if="val !== null && typeof val === 'string'" class="wrap">
                                <a v-if="isUrl(val)" :href="val" target="_blank" rel="noopener noreferrer">{{ val }}</a>
                                <template v-else>{{ val }}</template>
                            </div>
                            <ObjTable v-else-if="val !== null" :obj="val"></ObjTable>
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
import { clone, sortObjectKeys } from '../libs/utils';
export default {
    name: 'ObjTable',
    components: {
        ObjTable: () => import('./ObjTable.vue')
    },
    props: {
        obj: {
            required: true,
            default: null
        }
    },
    data() {
        return {
            tObj: null
        };
    },
    created() {
        this.processObject();
    },
    watch: {
        obj: {
            handler() {
                this.processObject();
            },
            deep: true
        }
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
                    // GeoImage adjustments
                    if (tObj.geotransform && Array.isArray(tObj.geotransform) && tObj.geotransform.length > 1) {
                        tObj.resolution = (tObj.geotransform[1]).toFixed(2) + ' meters';
                        delete (tObj.geotransform);
                    }

                    // Image / GeoImage Adjustments
                    if (tObj.width !== undefined && tObj.height !== undefined) {
                        tObj["Image Dimensions"] = `${tObj.width} x ${tObj.height}`;
                        delete (tObj.width);
                        delete (tObj.height);
                    }

                    // Point cloud / GeoImage adjustments
                    delete (tObj.projection);

                    // GeoImage adjustments
                    delete (tObj.focalLength35);
                    delete (tObj.orientation);

                    if (tObj.sensor) {
                        tObj.sensor = tObj.sensor.toUpperCase();
                    }

                    tObj = sortObjectKeys(tObj);
                }

                this.tObj = tObj;
            } catch (error) {
                console.error("Error processing object in ObjTable:", error);
                this.tObj = { error: "Error displaying data" };
            }
        },
        beautify: function (name) {
            if (typeof name !== 'string') return name;
            return name[0].toUpperCase() + name.substring(1).replace(/([a-z])([A-Z0-9])/g, '$1 $2');
        },
        isUrl: function (str) {
            if (!str) return false;
            try {
                // Check if string is a valid URL
                const url = new URL(str);
                return url.protocol === 'http:' || url.protocol === 'https:';
            } catch (e) {
                return false;
            }
        }
    }
}
</script>

<style scoped>
ul {
    margin: 0;
    padding-left: 1rem;
}

.wrap {
    word-wrap: break-word;
    word-break: break-all;
    white-space: normal;
}
</style>