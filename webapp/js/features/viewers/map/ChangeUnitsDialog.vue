<template>
    <Window id="changeUnitsDialog" title="Change Units" modal size-class="dialog-sm" fixed-size @on-close="close('cancel')">
        <div class="change-units-content">
            <p>
                Convert <strong>{{ measurementsCount }}</strong> measurement{{ measurementsCount !== 1 ? 's' : '' }}
                to <strong>{{ targetUnitLabel }}</strong>?
            </p>
            <p class="description">
                All existing measurements will be recalculated and displayed in {{ targetUnitLabel }} units.
            </p>
        </div>

        <div class="d-flex justify-content-end gap-2 mt-3 w-100">
            <Button severity="secondary" label="Cancel" @click="close('cancel')" />
            <Button severity="primary" label="Convert" @click="close('confirm')" />
        </div>
    </Window>
</template>

<script>
import Keyboard from '@/libs/keyboard';
import Window from '@/components/Window.vue';
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

    data: function () {
        return {};
    },

    computed: {
        targetUnitLabel() {
            return this.targetUnit === 'metric' ? 'Metric' : 'Imperial';
        }
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
    margin-bottom: 1rem;
}

.change-units-content p {
    margin: 0 0 0.5rem 0;
}

.change-units-content .description {
    color: var(--ddb-text-secondary);
    font-size: var(--ddb-font-size-base);
}
</style>
