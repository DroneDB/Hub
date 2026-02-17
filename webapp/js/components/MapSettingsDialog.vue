<template>
    <Window title="Map Settings" id="map-settings" @onClose="close" modal maxWidth="400px" fixedSize>
        <div class="map-settings-content">
            <div class="setting-row">
                <label class="setting-label"  style="align-items: baseline">
                    <i class="icon map"></i> Basemap
                </label>
                <select class="setting-select" :value="selectedBasemap" @change="onBasemapChange($event.target.value)">
                    <option v-for="(v, k) in basemaps" :key="k" :value="k">{{ v.label }}</option>
                </select>
            </div>

            <div class="setting-row">
                <label class="setting-label" style="align-items: baseline">
                    <i class="icon pencil alternate"></i> Measurement Units
                </label>
                <select style="margin-left: 1rem;" class="setting-select" :value="unitPref" @change="onUnitsChange($event.target.value)">
                    <option value="metric">Metric</option>
                    <option value="imperial">Imperial</option>
                </select>
            </div>

            <div class="setting-row">
                <label class="setting-label setting-toggle" @click="onFlightPathToggle">
                    <i class="icon route"></i> Show drone flight path
                    <input type="checkbox" :checked="showFlightPath" @click.stop="onFlightPathToggle" />
                </label>
            </div>
        </div>
    </Window>
</template>

<script>
import Keyboard from '../libs/keyboard';
import Window from './Window.vue';

export default {
    components: {
        Window
    },

    props: {
        basemaps: {
            type: Object,
            required: true
        },
        selectedBasemap: {
            type: String,
            required: true
        },
        unitPref: {
            type: String,
            required: true,
            validator: (value) => ['metric', 'imperial'].includes(value)
        },
        showFlightPath: {
            type: Boolean,
            required: true
        }
    },

    mounted: function () {
        Keyboard.onKeyDown(this.handleKeyDown);
    },

    beforeDestroy: function () {
        Keyboard.offKeyDown(this.handleKeyDown);
    },

    methods: {
        close: function () {
            this.$emit('onClose');
        },

        onBasemapChange: function (value) {
            this.$emit('basemapChanged', value);
        },

        onUnitsChange: function (value) {
            const oldUnit = this.unitPref;
            if (value !== oldUnit) {
                this.$emit('unitsChanged', value, oldUnit);
            }
        },

        onFlightPathToggle: function () {
            this.$emit('flightPathChanged', !this.showFlightPath);
        },

        handleKeyDown: function (e) {
            if (e.key === 'Escape') this.close();
        }
    }
}
</script>

<style scoped>
.map-settings-content {
    padding: 8px 0;
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 12px;
}

.setting-label {
    font-size: 13px;
    font-weight: 500;
    color: #333;
    display: flex;
    align-items: center;
    gap: 6px;
}

.setting-label .icon {
    margin: 0;
    color: #555;
}

.setting-toggle {
    cursor: pointer;
    width: 100%;
    justify-content: space-between;
    user-select: none;
}

.setting-toggle input[type="checkbox"] {
    cursor: pointer;
    width: 16px;
    height: 16px;
}

.setting-select {
    padding: 4px 8px;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 13px;
    background: white;
    cursor: pointer;
}

.setting-select:hover {
    border-color: #999;
}
</style>
