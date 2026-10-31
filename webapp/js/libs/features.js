/**
 * Feature flag constants.
 * These match the properties returned by the /sys/features endpoint.
 */
export const Features = {
    ORGANIZATION_MEMBER_MANAGEMENT: 'organizationMemberManagement',
    USER_MANAGEMENT: 'userManagement',
    // Whether the server sends e-mail: hide or disable what needs it when false
    EMAIL_ENABLED: 'emailEnabled',
    // Whether this server checks for new Registry releases: the update indicator and settings need it
    UPDATE_CHECK_ENABLED: 'updateCheckEnabled',
    // Anonymous fingerprint of the installation: lets the DroneDB site confirm a URL belongs to it
    INSTANCE_HASH: 'instanceHash',
    PASSWORD_POLICY: 'passwordPolicy',
    DATASET_THUMBNAIL_CANDIDATES: 'datasetThumbnailCandidates',
    MAX_EXPORT_SIZE_BYTES: 'maxExportSizeBytes',
    DISABLE_ANONYMOUS_BULK_DOWNLOADS: 'disableAnonymousBulkDownloads',
    BULK_DOWNLOAD_ASYNC_THRESHOLD_BYTES: 'bulkDownloadAsyncThresholdBytes',
    // What libddb does with each entry type, and the archives the server extracts
    ENTRY_TYPES: 'entryTypes',
    ARCHIVE_EXTENSIONS: 'archiveExtensions',
    // The heavy tools the server runs (id, title, hidden, disabled): a feature that needs one is offered only when it is listed
    TASK_TOOLS: 'taskTools'
};
