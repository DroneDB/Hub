<template>
    <Window title="Rescan Dataset" id="rescan-confirm" @onClose="close('cancel')" modal sizeClass="dialog-md" fixedSize>
        <div class="rescan-confirm-body">
            <div class="warning-box">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <div>
                    <strong>Are you sure you want to rescan this dataset?</strong>
                </div>
            </div>

            <p>This operation will re-process all indexed files to update their metadata (GPS coordinates, timestamps, thumbnails, etc.).</p>

            <div class="side-effects">
                <strong>Side effects:</strong>
                <ul>
                    <li>Existing metadata will be overwritten with newly extracted values</li>
                    <li>All cached thumbnails, tiles and derived files will be deleted</li>
                    <li>The operation may take a long time for large datasets</li>
                    <li>The application will be blocked until the process completes</li>
                </ul>
            </div>
        </div>

        <div class="d-flex justify-content-end gap-2 mt-3 w-100">
            <Button @click="close('cancel')" severity="secondary" label="Cancel" />
            <Button @click="close('confirm')" severity="danger" label="Rescan" />
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
    emits: ['onClose'],

    mounted: function () {
        Keyboard.onKeyDown(this.handleKeyDown);
    },
    beforeUnmount: function () {
        Keyboard.offKeyDown(this.handleKeyDown);
    },
    methods: {
        close: function (buttonId) {
            this.$emit('onClose', buttonId);
        },

        handleKeyDown: function (e) {
            if (e.key === 'Escape') this.close('cancel');
        }
    }
}
</script>

<style scoped>
.rescan-confirm-body {
    padding: 0.25rem 0;
    line-height: 1.5;
}

.warning-box {
    display: flex;
    gap: var(--ddb-spacing-sm);
    align-items: center;
    padding: var(--ddb-spacing-md) var(--ddb-spacing-md);
    margin-bottom: var(--ddb-spacing-md);
    background-color: rgba(251, 189, 8, 0.12);
    border: var(--ddb-border-width) solid rgba(251, 189, 8, 0.35);
    border-radius: var(--ddb-radius-sm);
}

.warning-box > .icon {
    color: var(--ddb-warning-text);
    font-size: var(--ddb-font-size-lg);
    flex-shrink: 0;
}

.side-effects {
    margin-top: var(--ddb-spacing-sm);
    padding: var(--ddb-spacing-sm) var(--ddb-spacing-md);
    background-color: rgba(0, 0, 0, 0.03);
    border-radius: var(--ddb-radius-sm);
}

.side-effects ul {
    margin: var(--ddb-spacing-xs) 0 0 0;
    padding-left: 1.25rem;
}

.side-effects li {
    margin-bottom: 0.25rem;
}
</style>
