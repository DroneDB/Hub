<template>
    <div class="flash" @mouseup="closeMouseUp">
        <PrimeMessage :severity="primeSeverity" :closable="true" @close="closeMouseUp" :icon="icon || undefined">
            <slot />
        </PrimeMessage>
    </div>
</template>

<script>
import PrimeMessage from 'primevue/message';

export default {
    components: {
        PrimeMessage
    },
    props: {
        icon: {
            type: String,
            default: ""
        },
        color: {
            type: String,
            default: "positive"
        }
    },
    data: function () {
        return {};
    },
    computed: {
        primeSeverity: function () {
            const map = {
                'positive': 'success',
                'negative': 'error',
                'warning': 'warn',
                'info': 'info'
            };
            return map[this.color] || 'success';
        }
    },
    methods: {
        closeMouseUp: function (e) {
            if (e) e.stopPropagation();
            this.$emit("onClose");
        }
    }
}
</script>

<style scoped>
.flash {
    &:hover {
        cursor: pointer;
    }

    position: absolute;
    z-index: 99999999;
    left: 0.5rem;
    right: 0.5rem;
    bottom: 0.5rem;
    border: var(--ddb-border-width) solid black;
}
</style>