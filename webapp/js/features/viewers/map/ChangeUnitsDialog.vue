<template>
    <Window id="changeUnitsDialog" title="Change Units" modal size-class="dialog-sm" fixed-size confirm-label="Convert" @close="$emit('close', 'cancel')" @confirm="$emit('close', 'confirm')">
        <div class="change-units-content">
            <p>
                Convert <strong>{{ measurementsCount }}</strong> measurement{{ measurementsCount !== 1 ? 's' : '' }}
                to <strong>{{ targetUnitLabel }}</strong>?
            </p>
            <p class="description">
                All existing measurements will be recalculated and displayed in {{ targetUnitLabel }} units.
            </p>
        </div>

    </Window>
</template>

<script>
import Window from '@/components/Window.vue';

export default {
    components: {
        Window
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
    emits: ['close'],

    data: function () {
        return {};
    },

    computed: {
        targetUnitLabel() {
            return this.targetUnit === 'metric' ? 'Metric' : 'Imperial';
        }
    },



    methods: {
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
