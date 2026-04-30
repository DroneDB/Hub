<template>
    <Dialog :visible="visible"
            @update:visible="onVisibleChange"
            modal
            header="DroneDB Hub updated"
            :style="{ width: '480px' }"
            :draggable="false"
            :closable="true">

        <div class="hub-update-body">
            <p>
                <i class="fas fa-circle-check text-success me-2"></i>
                <span v-if="notice && notice.from && notice.to">
                    DroneDB Hub has been updated from
                    <b>{{ notice.from }}</b> to <b>{{ notice.to }}</b>.
                </span>
                <span v-else>
                    DroneDB Hub has been updated.
                </span>
            </p>

            <p class="mb-2">Component versions on this server:</p>
            <ul class="component-list">
                <li v-if="hubVersion">
                    <i class="fab fa-vuejs me-2"></i>
                    <a :href="hubReleaseUrl" target="_blank" rel="noopener">
                        Hub <b>{{ hubVersion }}</b>
                    </a>
                </li>
                <li v-if="registryVersion">
                    <i class="fas fa-server me-2"></i>
                    <a :href="registryReleaseUrl" target="_blank" rel="noopener">
                        Registry <b>{{ registryVersion }}</b>
                    </a>
                </li>
                <li v-if="ddbVersion">
                    <i class="fas fa-database me-2"></i>
                    <a :href="ddbReleaseUrl" target="_blank" rel="noopener">
                        DroneDB <b>{{ ddbVersion }}</b>
                    </a>
                </li>
            </ul>
        </div>

        <template #footer>
            <Button label="OK" icon="fas fa-check" @click="dismiss" autofocus />
        </template>
    </Dialog>
</template>

<script>
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';

const RELEASE_BASE = {
    hub: 'https://github.com/DroneDB/Hub/releases/tag/v',
    registry: 'https://github.com/DroneDB/Registry/releases/tag/v',
    ddb: 'https://github.com/DroneDB/DroneDB/releases/tag/v'
};

export default {
    name: 'HubUpdateNoticeDialog',
    components: { Dialog, Button },
    props: {
        notice: {
            type: Object,
            default: null
        },
        hubVersion: { type: String, default: null },
        registryVersion: { type: String, default: null },
        ddbVersion: { type: String, default: null }
    },
    emits: ['close'],
    data() {
        return {
            visible: !!this.notice
        };
    },
    watch: {
        notice(val) {
            this.visible = !!val;
        }
    },
    computed: {
        hubReleaseUrl() {
            return this.hubVersion ? RELEASE_BASE.hub + this.hubVersion : '#';
        },
        registryReleaseUrl() {
            return this.registryVersion ? RELEASE_BASE.registry + this.registryVersion : '#';
        },
        ddbReleaseUrl() {
            return this.ddbVersion ? RELEASE_BASE.ddb + this.ddbVersion : '#';
        }
    },
    methods: {
        onVisibleChange(v) {
            this.visible = v;
            if (!v) this.$emit('close');
        },
        dismiss() {
            this.visible = false;
            this.$emit('close');
        }
    }
};
</script>

<style scoped>
.hub-update-body p {
    margin-bottom: 0.6rem;
}

.component-list {
    list-style: none;
    padding-left: 0;
    margin-bottom: 0;
}

.component-list li {
    padding: 0.25rem 0;
}

.component-list a {
    text-decoration: none;
}

.component-list a:hover {
    text-decoration: underline;
}

.text-success {
    color: var(--p-green-500, #22c55e);
}
</style>
