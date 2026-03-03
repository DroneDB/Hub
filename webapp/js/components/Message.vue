<template>
    <PrimeMessage v-if="parentRef[bindTo]" :severity="primeSeverity" :closable="!noDismiss" @close="dismiss">
        <span v-html="safeContent" />
    </PrimeMessage>
</template>

<script>
import PrimeMessage from 'primevue/message';
import { sanitizeHtml } from '../libs/sanitize';

export default {
    components: {
        PrimeMessage
    },
    props: {
        bindTo: {
            type: String,
            default: "message"
        },
        className: {
            type: String,
            default: "warning"
        },
        noDismiss: {
            type: Boolean,
            default: false
        }
    },
    data: function () {
        return {
            parentRef: {}
        }
    },
    computed: {
        primeSeverity: function () {
            const map = {
                'warning': 'warn',
                'error': 'error',
                'negative': 'error',
                'positive': 'success',
                'success': 'success',
                'info': 'info'
            };
            return map[this.className] || 'warn';
        },
        safeContent: function () {
            return sanitizeHtml(this.parentRef?.[this.bindTo] || '');
        }
    },
    beforeMount: function () {
        let p = this.$parent;
        while (p !== undefined && p[this.bindTo] === undefined) {
            p = p.$parent;
        }
        this.parentRef = p;
    },
    methods: {
        dismiss: function () {
            this.parentRef[this.bindTo] = "";
        }
    }
}
</script>

<style scoped></style>