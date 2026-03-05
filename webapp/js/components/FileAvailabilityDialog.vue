<template>
    <Window v-if="show" title="" id="fileAvailabilityDialog" @onClose="handleClose" modal sizeClass="dialog-lg" fixedSize>
        <div class="file-availability-dialog">
            <div class="dialog-header">
                <i :class="getHeaderIcon()"></i>
                {{ title }}
            </div>
            <div class="content">
                <div class="description">
                    <PrimeMessage :severity="getMessageSeverity()" :closable="false">
                        {{ message }}
                    </PrimeMessage>

                    <!-- Progress indicator for build in progress -->
                    <div v-if="status === 'building' && waitingForBuild" class="build-progress">
                        <div class="ui active inline loader small"></div>
                        <span class="ms-2">Waiting for build completion...</span>
                        <div class="progress-timer">{{ formatWaitTime() }}</div>
                    </div>

                    <!-- Build details if available -->
                    <div v-if="buildState && showDetails" class="build-details">
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
                                        <Tag :value="buildState.currentState" :severity="getTagSeverity(buildState.currentState)" />
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
            <div class="d-flex justify-content-end gap-2 mt-3 w-100">
                <Button v-if="hasAction('close')" @click="handleClose" severity="secondary" label="Close" />
                <Button v-if="hasAction('cancel')" @click="handleClose" label="Cancel" />
                <Button v-if="hasAction('details')" @click="toggleDetails"
                    :label="showDetails ? 'Hide Details' : 'Show Details'" />
                <Button v-if="hasAction('start-build')" severity="info"
                        @click="handleStartBuild" :disabled="processing"
                        icon="fa-solid fa-play" label="Start Processing" />
                <Button v-if="hasAction('retry-build')" severity="warn"
                        @click="handleRetryBuild" :disabled="processing"
                        icon="fa-solid fa-rotate-right" label="Retry Processing" />
                <Button v-if="hasAction('wait')" @click="handleClose" label="Wait" />
                <Button v-if="hasAction('wait-and-open')" severity="success"
                        @click="handleWaitAndOpen" :disabled="waitingForBuild"
                        icon="fa-solid fa-hourglass-half"
                        :label="waitingForBuild ? 'Waiting...' : 'Wait and Open'" />
            </div>
        </div>
    </Window>
</template>

<script>
import BuildManager from '../libs/buildManager';
import Window from './Window.vue';
import Button from 'primevue/button';
import PrimeMessage from 'primevue/message';
import Tag from 'primevue/tag';

export default {
    components: {
        Window, Button, PrimeMessage, Tag
    },
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

    beforeUnmount() {
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
                    return 'fa-solid fa-hourglass-half orange';
                case 'failed':
                    return 'fa-solid fa-circle-exclamation red';
                case 'queued':
                    return 'fa-regular fa-clock blue';
                case 'ready':
                    return 'fa-solid fa-circle-check green';
                case 'not-found':
                    return 'fa-solid fa-circle-question grey';
                default:
                    return 'fa-solid fa-circle-info';
            }
        },

        getMessageSeverity() {
            switch (this.status) {
                case 'building':
                    return 'warn';
                case 'failed':
                    return 'error';
                case 'queued':
                    return 'info';
                case 'not-found':
                    return 'warn';
                default:
                    return 'info';
            }
        },

        getTagSeverity(state) {
            switch (state) {
                case 'Succeeded':
                    return 'success';
                case 'Failed':
                    return 'danger';
                case 'Processing':
                    return 'warn';
                case 'Enqueued':
                case 'Scheduled':
                case 'Awaiting':
                    return 'info';
                default:
                    return 'secondary';
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
    max-width: 37.5rem;
}

.dialog-header {
    display: flex;
    align-items: center;
    gap: var(--ddb-spacing-sm);
    font-size: var(--ddb-font-size-lg);
    font-weight: bold;
    margin-bottom: var(--ddb-spacing-md);
}

.build-progress {
    margin-top: var(--ddb-spacing-lg);
    text-align: center;
    padding: var(--ddb-spacing-lg);
    background-color: var(--ddb-bg-light);
    border-radius: var(--ddb-radius-sm);
}

.progress-timer {
    margin-top: var(--ddb-spacing-sm);
    font-size: var(--ddb-font-size-base);
    color: var(--ddb-text-secondary);
}

.build-details {
    margin-top: var(--ddb-spacing-lg);
    background-color: var(--ddb-bg-light);
    padding: var(--ddb-spacing-lg);
    border-radius: var(--ddb-radius-sm);
}

.build-details h4 {
    margin-top: 0;
    margin-bottom: var(--ddb-spacing-sm);
}

.build-details code {
    font-size: var(--ddb-font-size-sm);
    background-color: var(--ddb-border-separator);
    padding: var(--ddb-spacing-xs) var(--ddb-spacing-xs);
    border-radius: var(--ddb-radius-sm);
}
</style>
