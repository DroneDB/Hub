<template>
    <Window id="build-confirm" title="Rebuild File" modal size-class="dialog-md" fixed-size @close="close('cancel')">
        <div class="build-confirm-body">
            <PrimeMessage severity="warn" :closable="false" icon="fa-solid fa-triangle-exclamation">
                <strong>This file is already ready for visualization.</strong>
            </PrimeMessage>

            <p>There is no need to rebuild this file. If you proceed:</p>

            <div class="side-effects">
                <ul>
                    <li>The operation may take a long time to complete</li>
                    <li>The file will not be available for visualization until the build is finished</li>
                    <li>You can monitor progress in the <strong>Tasks</strong> tab</li>
                </ul>
            </div>
        </div>

        <div class="d-flex justify-content-end gap-2 mt-3 w-100">
            <Button severity="secondary" label="Cancel" @click="close('cancel')" />
            <Button severity="danger" label="Rebuild Anyway" @click="close('confirm')" />
        </div>
    </Window>
</template>

<script>
import Window from '@/components/Window.vue';
import Button from 'primevue/button';
import PrimeMessage from 'primevue/message';

export default {
    components: {
        Window, Button, PrimeMessage
    },
    emits: ['confirm', 'cancel'],

    methods: {
        close: function (buttonId) {
            if (buttonId === 'confirm') {
                this.$emit('confirm');
            } else {
                this.$emit('cancel');
            }
        }
    }
}
</script>

<style scoped>
.build-confirm-body {
    padding: 0.25rem 0;
}

.side-effects {
    margin-top: 0.75rem;
}

.side-effects ul {
    margin: 0.5rem 0 0 1rem;
    padding: 0;
}

.side-effects li {
    margin-bottom: 0.25rem;
}
</style>
