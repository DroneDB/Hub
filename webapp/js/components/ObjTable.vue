<template>
    <div>
        <ul v-if="Array.isArray(tObj)">
            <li v-for="(item, index) in tObj">
                <ObjTable :obj="item"></ObjTable>
            </li>
        </ul>
        <div v-else-if="typeof tObj === 'object'">
            <table class="ui compact celled definition unstackable table">
                <tbody>
                    <tr v-for="(val, key) in tObj" :key="key">
                        <td style="white-space: nowrap;">
                            {{ beautify(key) }}
                        </td>
                        <td>
                            <div v-if="key == 'captureTime'">
                                {{ new Date(val) }}
                            </div>
                            <div v-else-if="key == 'bands'">
                                {{val.map(b => b.colorInterp).join(", ")}}
                            </div>
                            <div v-else-if="key == 'dimensions'">
                                {{ val.join(", ") }}
                            </div>
                            <div v-else-if="typeof val === 'string'" class="wrap">
                                {{ val }}
                            </div>
                            <ObjTable v-else :obj="val"></ObjTable>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
        <div v-else-if="typeof tObj === 'number'">
            {{ obj.toLocaleString() }}
        </div>
        <div v-else>
            {{ obj }}
        </div>
    </div>
</template>

<script>
import { clone, sortObjectKeys } from '../libs/utils';
export default {
    components: {
        ObjTable: () => import('./ObjTable.vue')
    },
    props: ["obj"],

    data: function () {
        let tObj = clone(this.obj);

        if (typeof tObj === 'object') {
            // GeoImage adjustments
            if (Array.isArray(tObj.geotransform)) {
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

        return {
            tObj
        };
    },
    beforeMount: function () {
    },
    methods: {
        beautify: function (name) {
            if (typeof name !== 'string') return name;
            return name[0].toUpperCase() + name.substring(1).replace(/([a-z])([A-Z0-9])/g, '$1 $2');
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