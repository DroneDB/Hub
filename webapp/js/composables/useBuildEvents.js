/**
 * Build Events Mixin
 * Manages build-related events and notifications
 */
import { pathutils } from 'ddb';

export default {
    methods: {
        // Build event handlers
        handleBuildStarted(file) {
            this.$notify.info(`Build started for ${file.label}`, { summary: 'Build Started' });
        },

        handleBuildError(data) {
            this.showError(data.error, "Build Error");
        },

        handleBuildRetried(build) {
            this.$notify.info(`Build restarted for ${build.path}`, { summary: 'Build Restarted' });
        },

        handleBuildRetryError(data) {
            this.showError(data.error, "Build Retry Error");
        },

        // Build notification handlers
        handleBuildStateNotification(data) {
            const fileName = data.filePath ? pathutils.basename(data.filePath) : 'file';

            switch (data.newState) {
                case 'Succeeded':
                    this.$notify.success(`Build completed for ${fileName}`, { summary: 'Build Completed' });
                    break;
                case 'Failed':
                    this.$notify.error(`Build failed for ${fileName}`, { summary: 'Build Failed' });
                    break;
                case 'Processing':
                    this.$notify.info(`Building ${fileName}...`, { summary: 'Building' });
                    break;
            }
        },

        handleBuildStartedNotification(data) {
            const fileName = data.filePath ? pathutils.basename(data.filePath) : 'file';
            this.$notify.info(`Build started for ${fileName}`, { summary: 'Build Started' });
        },

        handleBuildErrorNotification(data) {
            this.showError(data.error, "Build Error");
        },

        handleNewBuildableFilesNotification(data) {
            console.log('New buildable files detected notification:', data);
            if (data.dataset === this.dataset) {
                const fileCount = data.filePaths.length;
                this.$notify.info(`${fileCount} buildable file${fileCount > 1 ? 's' : ''} detected - processing in background`, { summary: 'Buildable Files Detected' });
            }
        }
    }
};
