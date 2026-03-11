/**
 * Build Events Mixin
 * Manages build-related events and notifications
 */
export default {
    methods: {
        // Build event handlers
        handleBuildStarted(file) {
            this.$toast.add({ severity: 'info', summary: 'Build Started', detail: `Build started for ${file.label}`, life: 3000 });
        },

        handleBuildError(data) {
            this.showError(data.error, "Build Error");
        },

        handleBuildRetried(build) {
            this.$toast.add({ severity: 'info', summary: 'Build Restarted', detail: `Build restarted for ${build.path}`, life: 3000 });
        },

        handleBuildRetryError(data) {
            this.showError(data.error, "Build Retry Error");
        },

        // Build notification handlers
        handleBuildStateNotification(data) {
            const fileName = data.filePath ? data.filePath.split('/').pop() : 'file';

            switch (data.newState) {
                case 'Succeeded':
                    this.$toast.add({ severity: 'success', summary: 'Build Completed', detail: `Build completed for ${fileName}`, life: 3000 });
                    break;
                case 'Failed':
                    this.$toast.add({ severity: 'error', summary: 'Build Failed', detail: `Build failed for ${fileName}`, life: 5000 });
                    break;
                case 'Processing':
                    this.$toast.add({ severity: 'info', summary: 'Building', detail: `Building ${fileName}...`, life: 3000 });
                    break;
            }
        },

        handleBuildStartedNotification(data) {
            const fileName = data.filePath ? data.filePath.split('/').pop() : 'file';
            this.$toast.add({ severity: 'info', summary: 'Build Started', detail: `Build started for ${fileName}`, life: 3000 });
        },

        handleBuildErrorNotification(data) {
            this.showError(data.error, "Build Error");
        },

        handleNewBuildableFilesNotification(data) {
            console.log('New buildable files detected notification:', data);
            if (data.dataset === this.dataset) {
                const fileCount = data.filePaths.length;
                this.$toast.add({ severity: 'info', summary: 'Buildable Files Detected', detail: `${fileCount} buildable file${fileCount > 1 ? 's' : ''} detected - processing in background`, life: 3000 });
            }
        }
    }
};
