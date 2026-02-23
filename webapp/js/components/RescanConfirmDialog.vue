<template>
    <Window title="Rescan Dataset" id="rescan-confirm" @onClose="close('cancel')" modal maxWidth="500px" fixedSize>
        <div class="rescan-confirm-body">
            <div class="warning-box">
                <i class="icon exclamation triangle"></i>
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

        <div class="buttons">
            <button @click="close('cancel')" class="ui button">
                Cancel
            </button>
            <button @click="close('confirm')" class="ui button negative">
                Rescan
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

    mounted: function () {
        Keyboard.onKeyDown(this.handleKeyDown);
    },
    beforeDestroy: function () {
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
    padding: 4px 0;
    line-height: 1.5;
}

.warning-box {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 12px 14px;
    margin-bottom: 14px;
    background-color: rgba(251, 189, 8, 0.12);
    border: 1px solid rgba(251, 189, 8, 0.35);
    border-radius: 4px;
}

.warning-box > .icon {
    color: #f2711c;
    font-size: 1.3em;
    flex-shrink: 0;
}

.side-effects {
    margin-top: 10px;
    padding: 10px 14px;
    background-color: rgba(0, 0, 0, 0.03);
    border-radius: 4px;
}

.side-effects ul {
    margin: 6px 0 0 0;
    padding-left: 20px;
}

.side-effects li {
    margin-bottom: 4px;
}

.buttons {
    margin-top: 18px;
    text-align: right;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
}
</style>
