<template>
    <div class="tab-view-loader">
        <Message bindTo="error" noDismiss />
        <div v-if="loading" class="loading">
            <p v-if="loadingText">{{ loadingText }}</p> <i class="icon circle notch spin" />
        </div>
    </div>
</template>

<script>
import Message from './Message';
import { b64encode, b64decode } from '../libs/base64';
import { setTitle } from '../libs/utils';
import reg from '../libs/sharedRegistry';
import ddb from 'ddb';

export default {
    components: {
        Message
    },
    props: ["titleSuffix", "loadingText"],
    data: function () {
        return {
            loading: true,
            error: ""
        }
    },
    mounted: async function () {
        let ds, path;
        const standalone = this.$route.params.encodedPath !== undefined;

        if (standalone) {
            ds = reg.Organization(this.$route.params.org)
                .Dataset(this.$route.params.ds);
            // Load file info from network
            path = b64decode(this.$route.params.encodedPath);
            this.$parent.ddbURI = ds.remoteUri(path);
        } else if (this.$parent.uri) {
            [ds, path] = ddb.utils.datasetPathFromUri(this.$parent.uri);
            this.$parent.ddbURI = this.$parent.uri;
        } else {
            this.error = "Invalid uri";
            return;
        }

        try {
            const entry = await ds.listOne(path);
            this.$parent.entry = entry;
            this.$parent.dataset = ds;

            // Get dataset permissions from dataset info (root entry)
            // Permissions are always at dataset level, not per file
            try {
                const rootEntry = await ds.info();
                if (rootEntry && rootEntry.length > 0 &&
                    rootEntry[0].properties &&
                    rootEntry[0].properties.permissions) {
                    this.$parent.canWrite = rootEntry[0].properties.permissions.canWrite || false;
                    this.$parent.canDelete = rootEntry[0].properties.permissions.canDelete || false;
                    this.$parent.canRead = rootEntry[0].properties.permissions.canRead || false;
                } else {
                    // Default to no permissions if not available
                    this.$parent.canWrite = false;
                    this.$parent.canDelete = false;
                    this.$parent.canRead = false;
                }
            } catch (permError) {
                console.warn('Could not load dataset permissions:', permError);
                // Default to no permissions if there's an error
                this.$parent.canWrite = false;
                this.$parent.canDelete = false;
                this.$parent.canRead = false;
            }

            if (this.$route.params.encodedPath) {
                const $header = this.$parent.$parent.$children[0];
                $header.selectedFiles = [{ path: this.$parent.ddbURI }];
                setTitle(`${ddb.pathutils.basename(entry.path)} - ${this.titleSuffix}`);
            }
        } catch (e) {
            this.error = e.message;
        }

        this.loading = false;
        if (!this.error) this.$emit("loaded");
    }
}
</script>

<style scoped>
.loading {
    padding: 12px;
    text-align: center;
}

.message.warning {
    margin: 12px;
}
</style>
