<template>
    <Window :title="title" id="paste-results" @onClose="close" modal sizeClass="dialog-lg" fixedSize>
        <div class="paste-results-content">
            <div v-if="succeeded.length > 0" class="result-section success-section">
                <h4>
                    <i class="fa-solid fa-circle-check green"></i>
                    Successfully {{ mode === 'cut' ? 'moved' : 'copied' }} ({{ succeeded.length }})
                </h4>
                <ul class="file-list">
                    <li v-for="s in succeeded" :key="s.source + '|' + s.dest" class="file-item success">
                        <i class="fa-solid fa-check green"></i>
                        <span class="file-path">{{ s.source }} → {{ s.dest }}</span>
                    </li>
                </ul>
            </div>

            <div v-if="skipped.length > 0" class="result-section">
                <h4>
                    <i class="fa-solid fa-forward"></i>
                    Skipped ({{ skipped.length }})
                </h4>
                <ul class="file-list">
                    <li v-for="path in skipped" :key="path" class="file-item">
                        <i class="fa-solid fa-forward"></i>
                        <span class="file-path">{{ path }}</span>
                    </li>
                </ul>
            </div>

            <div v-if="failedCount > 0" class="result-section error-section">
                <h4>
                    <i class="fa-solid fa-circle-exclamation red"></i>
                    Failed ({{ failedCount }})
                </h4>
                <ul class="file-list">
                    <li v-for="(error, path) in failed" :key="path" class="file-item error">
                        <i class="fa-solid fa-xmark red"></i>
                        <span class="file-path">{{ path }}</span>
                        <span class="error-message">{{ error }}</span>
                    </li>
                </ul>
            </div>
        </div>

        <div class="d-flex justify-content-end gap-2 mt-3 w-100">
            <Button @click="close" severity="secondary" label="Close" />
        </div>
    </Window>
</template>

<script>
import Keyboard from '@/libs/keyboard';
import Window from '@/components/Window.vue';
import Button from 'primevue/button';

export default {
    components: { Window, Button },
    props: {
        mode: { type: String, default: 'copy' },
        succeeded: { type: Array, default: () => [] },
        failed: { type: Object, default: () => ({}) },
        skipped: { type: Array, default: () => [] }
    },
    emits: ['onClose'],

    computed: {
        failedCount() { return Object.keys(this.failed).length; },
        title() {
            return this.mode === 'cut' ? 'Move Results' : 'Copy Results';
        }
    },

    mounted() { Keyboard.onKeyDown(this.handleKeyDown); },
    beforeUnmount() { Keyboard.offKeyDown(this.handleKeyDown); },

    methods: {
        close() { this.$emit('onClose'); },
        handleKeyDown(e) {
            if (e.key === 'Enter' || e.key === 'Escape') this.close();
        }
    }
};
</script>

<style scoped>
.paste-results-content {
    max-height: 25rem;
    overflow-y: auto;
}

.result-section {
    margin-bottom: 1rem;
}

.result-section h4 {
    margin-bottom: 0.5rem;
    display: flex;
    align-items: center;
    gap: 0.25rem;
}

.file-list {
    list-style: none;
    padding: 0;
    margin: 0;
}

.file-item {
    padding: var(--ddb-spacing-xs) var(--ddb-spacing-sm);
    margin: var(--ddb-spacing-xs) 0;
    border-radius: var(--ddb-radius-sm);
    display: flex;
    align-items: flex-start;
    gap: var(--ddb-spacing-sm);
}

.file-item.success {
    background-color: rgba(var(--ddb-success-rgb), 0.1);
}

.file-item.error {
    background-color: rgba(var(--ddb-danger-rgb), 0.1);
    flex-direction: column;
}

.file-path {
    word-break: break-all;
}

.error-message {
    color: rgb(var(--ddb-danger-rgb));
    font-size: 0.85em;
    padding-left: 1.25rem;
}

.green { color: #22c55e; }
.red { color: #ef4444; }
</style>
