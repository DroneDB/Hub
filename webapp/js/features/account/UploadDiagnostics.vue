<template>
    <Card id="upload-diagnostics" class="account-card">
        <template #content>
            <h3><i class="fa-solid fa-stethoscope" /> Upload diagnostics</h3>
            <p class="intro">
                Sends 8 MB of random data to the Registry (discarded on arrival), first on one connection,
                then on six at once, and shows what the connection to this server can carry.
            </p>

            <dl v-if="result" class="results">
                <div class="info-item">
                    <dt>Protocol</dt>
                    <dd>{{ result.protocol || 'unknown' }}</dd>
                </div>
                <div class="info-item">
                    <dt>Round trip</dt>
                    <dd>{{ result.rttMs.toFixed(0) }} ms</dd>
                </div>
                <div class="info-item">
                    <dt>One upload</dt>
                    <dd>{{ format(result.singleMBps) }}</dd>
                </div>
                <div class="info-item">
                    <dt>Six uploads at once</dt>
                    <dd>{{ format(result.parallelMBps) }}</dd>
                </div>
            </dl>

            <Message v-if="result && result.hint" severity="warn" :closable="false" class="hint">
                The reverse proxy window is limiting uploads: one upload stream runs at about
                {{ (result.hint.windowBytes / 1024).toFixed(0) }} KB per round trip
                ({{ format(result.hint.capMBps) }}), whatever the connection can do.
                <a :href="docsUrl" target="_blank" rel="noopener">How to fix it</a>
            </Message>
            <p v-if="error" class="error">{{ error }}</p>

            <Button :loading="running" :disabled="running" severity="secondary" icon="fa-solid fa-gauge-high" :label="result ? 'Run again' : 'Run test'"
                    @click="run" />
        </template>
    </Card>
</template>

<script>
import Button from 'primevue/button';
import Card from 'primevue/card';
import Message from 'primevue/message';
import reg from '@/libs/api/sharedRegistry';
import { runUploadProbe } from '@/libs/upload/uploadProbe';
import { DOCS } from '@/libs/docsLinks';

/**
 * UploadDiagnostics - the upload self-test: throughput, protocol and round trip
 * to this Registry, and the reverse proxy window when it is the limit.
 */
export default {
    name: 'UploadDiagnostics',
    components: { Button, Card, Message },
    data() {
        return { running: false, result: null, error: '', docsUrl: DOCS.largeUploads };
    },
    methods: {
        format(mbps) {
            return `${mbps.toFixed(1)} MB/s (${(mbps * 8.389).toFixed(0)} Mbit/s)`;
        },
        async run() {
            this.running = true;
            this.error = '';
            try {
                this.result = await runUploadProbe({
                    upload: async body => {
                        const res = await reg.sys.uploadProbe(body);
                        if (res.status === 429) throw new Error('Too many tests in a short time: try again in a minute');
                        if (!res.ok) throw new Error(`The test upload failed (HTTP ${res.status})`);
                    },
                    ping: async () => {
                        await reg.sys.ping();
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
    color: var(--ddb-text-muted);
    font-size: 0.9rem;
}

.results {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    gap: var(--ddb-spacing-md);
    margin: var(--ddb-spacing-md) 0;
}

.results dd {
    margin: 0;
}

.results dt {
    font-weight: normal;
    font-size: 0.8rem;
    color: var(--ddb-text-muted);
}

.hint {
    margin-bottom: var(--ddb-spacing-md);
}

.error {
    color: var(--ddb-danger);
}
</style>
