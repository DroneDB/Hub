<template>
    <Window title="Rescan Results" id="rescan-results" @onClose="close" modal maxWidth="600px" fixedSize>
        <div class="rescan-results-content">
            <!-- Summary -->
            <div class="summary">
                <span class="summary-item">
                    <strong>{{ result.totalProcessed }}</strong> entries processed
                </span>
                <span class="summary-item success-count" v-if="result.successCount > 0">
                    <i class="fa-solid fa-circle-check green"></i> {{ result.successCount }} successful
                </span>
                <span class="summary-item error-count" v-if="result.errorCount > 0">
                    <i class="fa-solid fa-circle-exclamation red"></i> {{ result.errorCount }} errors
                </span>
            </div>

            <!-- Success section -->
            <div v-if="successEntries.length > 0" class="result-section success-section">
                <h4><i class="fa-solid fa-circle-check green"></i> Successfully Rescanned ({{ successEntries.length }})</h4>
                <ul class="file-list">
                    <li v-for="entry in successEntries" :key="entry.path" class="file-item success">
                        <i class="fa-solid fa-check green"></i>
                        <span class="file-path">{{ entry.path }}</span>
                    </li>
                </ul>
            </div>

            <!-- Failure section -->
            <div v-if="errorEntries.length > 0" class="result-section error-section">
                <h4><i class="fa-solid fa-circle-exclamation red"></i> Failed to Rescan ({{ errorEntries.length }})</h4>
                <ul class="file-list">
                    <li v-for="entry in errorEntries" :key="entry.path" class="file-item error">
                        <i class="fa-solid fa-xmark red"></i>
                        <span class="file-path">{{ entry.path }}</span>
                        <span class="error-message">{{ entry.error }}</span>
                    </li>
                </ul>
            </div>
        </div>

        <div class="d-flex justify-content-end gap-2 mt-3">
            <Button @click="close" severity="info" label="Close" />
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
        result: {
            type: Object,
            required: true
        }
    },
    emits: ['onClose'],

    computed: {
        successEntries() {
            return (this.result.entries || []).filter(e => e.success);
        },
        errorEntries() {
            return (this.result.entries || []).filter(e => !e.success);
        }
    },

    mounted: function () {
        Keyboard.onKeyDown(this.handleKeyDown);
    },
    beforeUnmount: function () {
        Keyboard.offKeyDown(this.handleKeyDown);
    },
    methods: {
        close: function () {
            this.$emit('onClose');
        },

        handleKeyDown: function (e) {
            if (e.key === 'Enter' || e.key === 'Escape') {
                this.close();
            }
        }
    }
}
</script>

<style scoped>
.rescan-results-content {
    max-height: 25rem;
    overflow-y: auto;
}

.summary {
    display: flex;
    gap: 1rem;
    padding: 0.5rem 0 0.75rem 0;
    margin-bottom: 0.75rem;
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
    flex-wrap: wrap;
    align-items: center;
}

.summary-item {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
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
    padding: 0.375rem 0.5rem;
    margin: 0.25rem 0;
    border-radius: 0.25rem;
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
}

.file-item.success {
    background-color: rgba(33, 186, 69, 0.1);
}

.file-item.error {
    background-color: rgba(219, 40, 40, 0.1);
    flex-direction: column;
}

.file-item.error > div:first-child {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.file-path {
    font-family: monospace;
    word-break: break-all;
}

.error-message {
    font-size: 0.9em;
    color: #db2828;
    margin-left: 1.375rem;
    font-style: italic;
}
</style>
