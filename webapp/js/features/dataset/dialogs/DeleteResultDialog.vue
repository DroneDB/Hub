<template>
    <Window id="delete-results" title="Delete Results" modal size-class="dialog-lg" fixed-size close-button cancel-label="Close" @close="close" @confirm="close">
        <div class="delete-results-content">
            <!-- Success section -->
            <div v-if="deleted.length > 0" class="result-section success-section">
                <h4><i class="fa-solid fa-circle-check green" /> Successfully Deleted ({{ deleted.length }})</h4>
                <ul class="file-list">
                    <li v-for="path in deleted" :key="path" class="file-item success">
                        <i class="fa-solid fa-check green" />
                        <span class="file-path">{{ path }}</span>
                    </li>
                </ul>
            </div>

            <!-- Failure section -->
            <div v-if="Object.keys(failed).length > 0" class="result-section error-section">
                <h4><i class="fa-solid fa-circle-exclamation red" /> Failed to Delete ({{ Object.keys(failed).length }})</h4>
                <ul class="file-list">
                    <li v-for="(error, path) in failed" :key="path" class="file-item error">
                        <i class="fa-solid fa-xmark red" />
                        <span class="file-path">{{ path }}</span>
                        <span class="error-message">{{ error }}</span>
                    </li>
                </ul>
            </div>
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
        deleted: {
            type: Array,
            default: () => []
        },
        failed: {
            type: Object,
            default: () => ({})
        }
    },
    emits: ['close'],

    methods: {
        close: function () {
            this.$emit('close');
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
    font-size: var(--ddb-font-size-base);
    color: var(--ddb-danger);
    margin-left: 1.5rem;
    font-style: italic;
}
</style>
