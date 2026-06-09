<template>
    <Dialog :visible="visible" @update:visible="$emit('update:visible', $event)" modal
        :header="`Log - ${title}`" :style="{ width: '48rem' }">
        <pre class="task-log">{{ logText || 'No log output.' }}</pre>
        <template #footer>
            <Button label="Refresh" severity="secondary" icon="fa-solid fa-arrows-rotate" @click="$emit('refresh')" />
            <Button label="Close" @click="$emit('update:visible', false)" />
        </template>
    </Dialog>
</template>

<script>
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';

/**
 * Presentational task log viewer dialog, shared by the Task History tab and the
 * admin Tasks dashboard (spec §B.3). The parent owns the log fetching and passes
 * the text in; this component only renders and re-emits refresh/close.
 */
export default {
    name: 'TaskLogDialog',

    components: { Dialog, Button },

    props: {
        visible: { type: Boolean, default: false },
        title: { type: String, default: '' },
        logText: { type: String, default: '' }
    },

    emits: ['update:visible', 'refresh']
};
</script>

<style scoped>
.task-log {
    max-height: 24rem;
    overflow: auto;
    background: #1e1e1e;
    color: #d4d4d4;
    padding: 0.75rem;
    border-radius: 4px;
    font-size: 0.8rem;
    white-space: pre-wrap;
    word-break: break-word;
}
</style>
