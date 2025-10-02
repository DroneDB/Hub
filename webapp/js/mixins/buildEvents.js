/**
 * Build Events Mixin
 * Manages build-related events and notifications
 */
export default {
    methods: {
        // Build event handlers
        handleBuildStarted(file) {
            this.flash = `Build started for ${file.label}`;
        },

        handleBuildError(data) {
            this.showError(data.error, "Build Error");
        },

        handleBuildRetried(build) {
            this.flash = `Build restarted for ${build.path}`;
        },

        handleBuildRetryError(data) {
            this.showError(data.error, "Build Retry Error");
        },

        // Build notification handlers
        handleBuildStateNotification(data) {
            const fileName = data.filePath ? data.filePath.split('/').pop() : 'file';

            switch (data.newState) {
                case 'Succeeded':
                    this.flash = `Build completed for ${fileName}`;
                    break;
                case 'Failed':
                    this.flash = `❌ Build failed for ${fileName}`;
                    break;
                case 'Processing':
                    this.flash = `⚙️ Building ${fileName}...`;
                    break;
            }
        },

        handleBuildStartedNotification(data) {
            const fileName = data.filePath ? data.filePath.split('/').pop() : 'file';
            this.flash = `🚀 Build started for ${fileName}`;
        },

        handleBuildErrorNotification(data) {
            this.showError(data.error, "Build Error");
        },

        handleNewBuildableFilesNotification(data) {
            console.log('New buildable files detected notification:', data);
            if (data.dataset === this.dataset) {
                const fileCount = data.filePaths.length;
                this.flash = `${fileCount} buildable file${fileCount > 1 ? 's' : ''} detected - processing in background`;
            }
        }
    }
};
