<template>
    <Window title="Delete Results" id="delete-results" @onClose="close" modal maxWidth="600px" fixedSize>
        <div class="delete-results-content">
            <!-- Success section -->
            <div v-if="deleted.length > 0" class="result-section success-section">
                <h4><i class="fa-solid fa-circle-check green"></i> Successfully Deleted ({{ deleted.length }})</h4>
                <ul class="file-list">
                    <li v-for="path in deleted" :key="path" class="file-item success">
                        <i class="fa-solid fa-check green"></i>
                        <span class="file-path">{{ path }}</span>
                    </li>
                </ul>
            </div>

            <!-- Failure section -->
            <div v-if="Object.keys(failed).length > 0" class="result-section error-section">
                <h4><i class="fa-solid fa-circle-exclamation red"></i> Failed to Delete ({{ Object.keys(failed).length }})</h4>
                <ul class="file-list">
                    <li v-for="(error, path) in failed" :key="path" class="file-item error">
                        <i class="fa-solid fa-xmark red"></i>
                        <span class="file-path">{{ path }}</span>
                        <span class="error-message">{{ error }}</span>
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
        deleted: {
            type: Array,
            default: () => []
        },
        failed: {
            type: Object,
            default: () => ({})
        }
    },
    emits: ['onClose'],

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
.delete-results-content {
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
