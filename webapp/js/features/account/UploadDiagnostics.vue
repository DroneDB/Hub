<template>
    <Card class="account-card" id="upload-diagnostics">
        <template #content>
            <h3><i class="fa-solid fa-stethoscope"></i> Upload diagnostics</h3>
            <p class="intro">
                Sends 8 MB of random data to the Registry (discarded on arrival), first on one connection,
                then on six at once, and shows what the connection to this server can carry.
            </p>

            <div v-if="result" class="results">
                <div class="info-item">
                    <label>Protocol</label>
                    <p>{{ result.protocol || 'unknown' }}</p>
                </div>
                <div class="info-item">
                    <label>Round trip</label>
                    <p>{{ result.rttMs.toFixed(0) }} ms</p>
                </div>
                <div class="info-item">
                    <label>One upload</label>
                    <p>{{ format(result.singleMBps) }}</p>
                </div>
                <div class="info-item">
                    <label>Six uploads at once</label>
                    <p>{{ format(result.parallelMBps) }}</p>
                </div>
            </div>

            <Message v-if="result && result.hint" severity="warn" :closable="false" class="hint">
                The reverse proxy window is limiting uploads: one upload stream runs at about
                {{ (result.hint.windowBytes / 1024).toFixed(0) }} KB per round trip
                ({{ format(result.hint.capMBps) }}), whatever the connection can do.
                <a :href="docsUrl" target="_blank" rel="noopener">How to fix it</a>
            </Message>
            <p v-if="error" class="error">{{ error }}</p>

            <Button @click="run" :loading="running" :disabled="running" severity="secondary" icon="fa-solid fa-gauge-high"
                :label="result ? 'Run again' : 'Run test'" />
        </template>
    </Card>
</template>

<script>
import Button from 'primevue/button';
import Card from 'primevue/card';
import Message from 'primevue/message';
import reg from '@/libs/api/sharedRegistry';
import { runUploadProbe } from '@/libs/upload/uploadProbe';

const DOCS_URL = 'https://docs.dronedb.app/docs/registry/admin/troubleshooting#tuning-the-reverse-proxy-for-large-uploads';

/**
 * UploadDiagnostics - the upload self-test (UPL-01 A.2): throughput, protocol and round trip
 * to this Registry, and the reverse proxy window when it is the limit.
 */
export default {
    name: 'UploadDiagnostics',
    components: { Button, Card, Message },
    data() {
        return { running: false, result: null, error: '', docsUrl: DOCS_URL };
    },
    methods: {
        format(mbps) {
            return `${mbps.toFixed(1)} MB/s (${(mbps * 8.389).toFixed(0)} Mbit/s)`;
        },
        async run() {
            this.running = true;
            this.error = '';
            try {
                const headers = () => {
                    const token = reg.getAuthToken();
                    return token ? { Authorization: `Bearer ${token}` } : {};
                };
                this.result = await runUploadProbe({
                    upload: async body => {
                        const res = await fetch(`${reg.url}/sys/upload-probe`, {
                            method: 'POST', body, headers: headers(), cache: 'no-store'
                        });
                        if (res.status === 429) throw new Error('Too many tests in a short time: try again in a minute');
                        if (!res.ok) throw new Error(`The test upload failed (HTTP ${res.status})`);
                    },
                    ping: async () => {
                        await fetch(`${reg.url}/sys/version`, { headers: headers(), cache: 'no-store' });
                    }
                });
            } catch (e) {
                this.error = e.message;
            } finally {
                this.running = false;
            }
        }
    }
};
</script>

<style scoped>
.intro {
    color: var(--ddb-text-muted, #666);
    font-size: 0.9rem;
}

.results {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    gap: var(--ddb-spacing-md, 1rem);
    margin: var(--ddb-spacing-md, 1rem) 0;
}

.results label {
    font-size: 0.8rem;
    color: var(--ddb-text-muted, #666);
}

.hint {
    margin-bottom: var(--ddb-spacing-md, 1rem);
}

.error {
    color: var(--ddb-danger, #c00);
}
</style>
