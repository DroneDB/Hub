<template>
    <div v-if="show" class="ui dimmer modals page visible active">
        <div class="ui small modal visible active file-availability-dialog">
            <i class="close icon" @click="handleClose"></i>
            <div class="header">
                <i class="icon" :class="getHeaderIcon()"></i>
                {{ title }}
            </div>
            <div class="content">
                <div class="description">
                    <div class="ui" :class="getMessageClass()">
                        <div class="message-content">
                            {{ message }}
                        </div>
                    </div>

                    <!-- Progress indicator for build in progress -->
                    <div v-if="status === 'building' && waitingForBuild" class="ui segment build-progress">
                        <div class="ui active inline loader small"></div>
                        <span style="margin-left: 10px;">Waiting for build completion...</span>
                        <div class="progress-timer">{{ formatWaitTime() }}</div>
                    </div>

                    <!-- Build details if available -->
                    <div v-if="buildState && showDetails" class="ui segment build-details">
                        <h4>Build Details</h4>
                        <table class="ui very basic compact table">
                            <tbody>
                                <tr>
                                    <td><strong>Job ID:</strong></td>
                                    <td><code>{{ buildState.jobId }}</code></td>
                                </tr>
                                <tr>
                                    <td><strong>Status:</strong></td>
                                    <td>
                                        <span class="ui label mini" :class="getStateClass(buildState.currentState)">
                                            {{ buildState.currentState }}
                                        </span>
                                    </td>
                                </tr>
                                <tr v-if="buildState.createdAt">
                                    <td><strong>Created:</strong></td>
                                    <td>{{ formatDate(buildState.createdAt) }}</td>
                                </tr>
                                <tr v-if="buildState.processingAt">
                                    <td><strong>Processing:</strong></td>
                                    <td>{{ formatDate(buildState.processingAt) }}</td>
                                </tr>
                                <tr v-if="buildState.failedAt">
                                    <td><strong>Failed:</strong></td>
                                    <td>{{ formatDate(buildState.failedAt) }}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            <div class="actions">
                <button v-if="hasAction('close')" class="ui button" @click="handleClose">
                    Close
                </button>
                <button v-if="hasAction('cancel')" class="ui button" @click="handleClose">
                    Cancel
                </button>
                <button v-if="hasAction('details')" class="ui button" @click="toggleDetails">
                    {{ showDetails ? 'Hide' : 'Show' }} Details
                </button>
                <button v-if="hasAction('start-build')" class="ui primary button"
                        @click="handleStartBuild" :disabled="processing">
                    <i class="play icon"></i>
                    Start Processing
                </button>
                <button v-if="hasAction('retry-build')" class="ui orange button"
                        @click="handleRetryBuild" :disabled="processing">
                    <i class="redo icon"></i>
                    Retry Processing
                </button>
                <button v-if="hasAction('wait')" class="ui button" @click="handleClose">
                    Wait
                </button>
                <button v-if="hasAction('wait-and-open')" class="ui positive button"
                        @click="handleWaitAndOpen" :disabled="waitingForBuild">
                    <i class="hourglass half icon"></i>
                    {{ waitingForBuild ? 'Waiting...' : 'Wait and Open' }}
                </button>
            </div>
        </div>
    </div>
</template>

<script>
import BuildManager from '../libs/buildManager';

export default {
    props: {
        show: {
            type: Boolean,
            default: false
        },
        title: {
            type: String,
            required: true
        },
        message: {
            type: String,
            required: true
        },
        status: {
            type: String,
            required: true
        },
        actions: {
            type: Array,
            default: () => []
        },
        buildState: {
            type: Object,
            default: null
        },
        dataset: {
            type: Object,
            required: true
        },
        entry: {
            type: Object,
            required: true
        }
    },

    data() {
        return {
            showDetails: false,
            processing: false,
            waitingForBuild: false,
            waitStartTime: null,
            pollInterval: null
        };
    },

    beforeDestroy() {
        this.stopPolling();
    },

    methods: {
        handleClose() {
            this.stopPolling();
            this.$emit('close');
        },

        async handleStartBuild() {
            this.processing = true;
            try {
                await BuildManager.startBuild(this.dataset, this.entry.path, false);
                this.$emit('build-started', this.entry);

                // Automatically start waiting
                this.handleWaitAndOpen();
            } catch (error) {
                this.$emit('error', error.message);
                this.processing = false;
            }
        },

        async handleRetryBuild() {
            this.processing = true;
            try {
                await BuildManager.startBuild(this.dataset, this.entry.path, true);
                this.$emit('build-started', this.entry);

                // Automatically start waiting
                this.handleWaitAndOpen();
            } catch (error) {
                this.$emit('error', error.message);
                this.processing = false;
            }
        },

        handleWaitAndOpen() {
            this.waitingForBuild = true;
            this.waitStartTime = Date.now();
            this.startPolling();
        },

        startPolling() {
            this.stopPolling();

            this.pollInterval = setInterval(async () => {
                try {
                    const buildState = BuildManager.getBuildState(this.dataset, this.entry.path);

                    if (!buildState) {
                        // Ricarica i build
                        await BuildManager.loadBuilds(this.dataset);
                        return;
                    }

                    if (buildState.currentState === 'Succeeded') {
                        this.stopPolling();
                        this.$emit('build-completed', this.entry);
                        this.handleClose();
                    } else if (buildState.currentState === 'Failed') {
                        this.stopPolling();
                        this.waitingForBuild = false;
                        this.$emit('build-failed', buildState);
                    }

                    // Timeout after 5 minutes
                    if (Date.now() - this.waitStartTime > 300000) {
                        this.stopPolling();
                        this.waitingForBuild = false;
                        this.$emit('timeout');
                    }
                } catch (error) {
                    console.error('Error polling build state:', error);
                }
            }, 3000); // Poll every 3 seconds
        },

        stopPolling() {
            if (this.pollInterval) {
                clearInterval(this.pollInterval);
                this.pollInterval = null;
            }
        },

        toggleDetails() {
            this.showDetails = !this.showDetails;
        },

        hasAction(action) {
            return this.actions.includes(action);
        },

        getHeaderIcon() {
            switch (this.status) {
                case 'building':
                    return 'hourglass half orange';
                case 'failed':
                    return 'exclamation circle red';
                case 'queued':
                    return 'clock outline blue';
                case 'ready':
                    return 'check circle green';
                case 'not-found':
                    return 'question circle grey';
                default:
                    return 'info circle';
            }
        },

        getMessageClass() {
            switch (this.status) {
                case 'building':
                    return 'message warning';
                case 'failed':
                    return 'message error';
                case 'queued':
                    return 'message info';
                case 'not-found':
                    return 'message warning';
                default:
                    return 'message';
            }
        },

        getStateClass(state) {
            switch (state) {
                case 'Succeeded':
                    return 'green';
                case 'Failed':
                    return 'red';
                case 'Processing':
                    return 'yellow';
                case 'Enqueued':
                case 'Scheduled':
                case 'Awaiting':
                    return 'blue';
                default:
                    return 'grey';
            }
        },

        formatDate(dateString) {
            if (!dateString) return '-';
            const date = new Date(dateString);
            return date.toLocaleString('en-US', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        },

        formatWaitTime() {
            if (!this.waitStartTime) return '';
            const elapsed = Math.floor((Date.now() - this.waitStartTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            return `Elapsed time: ${minutes}m ${seconds}s`;
        }
    }
};
</script>

<style scoped>
.file-availability-dialog {
    max-width: 600px;
}

.file-availability-dialog .header {
    display: flex;
    align-items: center;
    gap: 8px;
}

.file-availability-dialog .header .icon {
    margin: 0 !important;
}

.message-content {
    white-space: pre-line;
    line-height: 1.6;
}

.build-progress {
    margin-top: 15px;
    text-align: center;
    padding: 15px;
}

.progress-timer {
    margin-top: 10px;
    font-size: 0.9em;
    color: #666;
}

.build-details {
    margin-top: 15px;
    background-color: #f8f9fa;
}

.build-details h4 {
    margin-top: 0;
    margin-bottom: 10px;
}

.build-details code {
    font-size: 0.85em;
    background-color: #e9ecef;
    padding: 2px 6px;
    border-radius: 3px;
}

.ui.message {
    text-align: left;
}

.ui.message.warning {
    background-color: #fffaf3;
    color: #573a08;
}

.ui.message.error {
    background-color: #fff6f6;
    color: #9f3a38;
}

.ui.message.info {
    background-color: #f8ffff;
    color: #276f86;
}
</style>
