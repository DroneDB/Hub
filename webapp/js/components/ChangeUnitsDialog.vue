<template>
    <Window title="Change Units" id="changeUnitsDialog" @onClose="close('cancel')" modal maxWidth="400px" fixedSize>
        <div class="change-units-content">
            <p>
                Convert <strong>{{ measurementsCount }}</strong> measurement{{ measurementsCount !== 1 ? 's' : '' }}
                to <strong>{{ targetUnitLabel }}</strong>?
            </p>
            <p class="description">
                All existing measurements will be recalculated and displayed in {{ targetUnitLabel }} units.
            </p>
        </div>

        <div class="buttons">
            <Button @click="close('cancel')" severity="secondary" label="Cancel" />
            <Button @click="close('confirm')" severity="info" label="Convert" />
        </div>
    </Window>
</template>

<script>
import Keyboard from '../libs/keyboard';
import Window from './Window.vue';
import Button from 'primevue/button';

export default {
    components: {
        Window, Button
    },

    props: {
        targetUnit: {
            type: String,
            required: true,
            validator: (value) => ['metric', 'imperial'].includes(value)
        },
        measurementsCount: {
            type: Number,
            required: true
        }
    },
    emits: ['onClose'],

    computed: {
        targetUnitLabel() {
            return this.targetUnit === 'metric' ? 'Metric' : 'Imperial';
        }
    },

    data: function () {
        return {};
    },

    mounted: function () {
        Keyboard.onKeyDown(this.handleKeyDown);
    },

    beforeUnmount: function () {
        Keyboard.offKeyDown(this.handleKeyDown);
    },

    methods: {
        close: function (buttonId) {
            this.$emit('onClose', buttonId);
        },

        handleKeyDown: function (e) {
            if (e.key === 'Enter') this.close('confirm');
            if (e.key === 'Escape') this.close('cancel');
        }
    }
}
</script>

<style scoped>
.change-units-content {
    margin-bottom: 16px;
}

.change-units-content p {
    margin: 0 0 8px 0;
}

.change-units-content .description {
    color: #666;
    font-size: 0.9em;
}

.buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
}
</style>
