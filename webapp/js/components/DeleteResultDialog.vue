<template>
    <Window title="Delete Results" id="delete-results" @onClose="close" modal maxWidth="600px" fixedSize>
        <div class="delete-results-content">
            <!-- Success section -->
            <div v-if="deleted.length > 0" class="result-section success-section">
                <h4><i class="check circle icon green"></i> Successfully Deleted ({{ deleted.length }})</h4>
                <ul class="file-list">
                    <li v-for="path in deleted" :key="path" class="file-item success">
                        <i class="check icon green"></i>
                        <span class="file-path">{{ path }}</span>
                    </li>
                </ul>
            </div>

            <!-- Failure section -->
            <div v-if="Object.keys(failed).length > 0" class="result-section error-section">
                <h4><i class="exclamation circle icon red"></i> Failed to Delete ({{ Object.keys(failed).length }})</h4>
                <ul class="file-list">
                    <li v-for="(error, path) in failed" :key="path" class="file-item error">
                        <i class="times icon red"></i>
                        <span class="file-path">{{ path }}</span>
                        <span class="error-message">{{ error }}</span>
                    </li>
                </ul>
            </div>
        </div>

        <div class="buttons">
            <button @click="close" class="ui button primary">
                Close
            </button>
        </div>
    </Window>
</template>

<script>
import Keyboard from '../libs/keyboard';
import Window from './Window.vue';

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

    mounted: function () {
        Keyboard.onKeyDown(this.handleKeyDown);
    },
    beforeDestroy: function () {
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
    max-height: 400px;
    overflow-y: auto;
}

.result-section {
    margin-bottom: 16px;
}

.result-section h4 {
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 4px;
}

.file-list {
    list-style: none;
    padding: 0;
    margin: 0;
}

.file-item {
    padding: 6px 8px;
    margin: 4px 0;
    border-radius: 4px;
    display: flex;
    align-items: flex-start;
    gap: 8px;
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
    gap: 8px;
}

.file-path {
    font-family: monospace;
    word-break: break-all;
}

.error-message {
    font-size: 0.9em;
    color: #db2828;
    margin-left: 22px;
    font-style: italic;
}

.buttons {
    margin-top: 16px;
    text-align: right;
}
</style>
