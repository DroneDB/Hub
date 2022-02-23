<template>
    <div>
        <ul v-if="Array.isArray(obj)">
            <li v-for="(item, index) in obj">
                <ObjTable :obj="item"></ObjTable>
            </li>
        </ul>
        <div v-else-if="typeof obj === 'object'">
            <table class="ui compact celled definition unstackable table">
                <tbody>
                    <tr v-for="(val, key) in obj" :key="key">
                        <td style="white-space: nowrap;">
                            {{beautify(key)}}<span v-if="Array.isArray(val)">&nbsp;[{{val.length}}]</span>
                        </td>
                        <td>
                            <div v-if="key=='captureTime'">
                                {{new Date(val)}}
                            </div>
                            <div v-else-if="typeof val === 'string'" class="wrap">
                                {{val}}
                            </div>
                            <ObjTable v-else :obj="val"></ObjTable>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
        <div v-else-if="typeof obj === 'number'">
            {{obj.toLocaleString()}}
        </div>
        <div v-else>
            {{obj}}
        </div>
    </div>
</template>

<script>

export default {
    components: {
        ObjTable: () => import('./ObjTable.vue')
    },
    props: ["obj"],

    data: function(){
        return {};
    },
    beforeMount: function(){
    },
    methods: {
        beautify(name) {
            if (typeof name !== 'string') return name;
            return name[0].toUpperCase() + name.substring(1).replace(/([a-z])([A-Z0-9])/g, '$1 $2');
        }
    }
}
</script>

<style scoped>
ul{
    margin: 0;
    padding-left: 1rem;
}
.wrap { 
   word-wrap: break-word;
   word-break: break-all;
   white-space: normal;
}
</style>