<template>
    <Window id="ogc-usage-hints" title="How to use this OGC service" modal fixed-size @close="$emit('close')">
        <div class="content">
            <h4 class="mt-0">{{ hints.title }}</h4>

            <div class="hint-section">
                <div class="hint-label"><i class="fa-solid fa-circle-info" /> About</div>
                <div class="hint-text">{{ hints.notes }}</div>
            </div>

            <div class="hint-section">
                <div class="hint-label"><i class="fa-solid fa-map" /> QGIS</div>
                <div class="hint-text">{{ hints.qgis }}</div>
            </div>

            <div class="hint-section">
                <div class="hint-label"><i class="fa-solid fa-earth-americas" /> ArcGIS Pro</div>
                <div class="hint-text">{{ hints.arcgis }}</div>
            </div>

            <div class="hint-section">
                <div class="hint-label"><i class="fa-solid fa-terminal" /> GDAL / OGR</div>
                <div v-if="hints.gdal !== '-'" class="hint-text">
                    <code>{{ hints.gdal.replace('<capabilities-url>', url).replace('<landing-url>', url) }}</code>
                </div>
                <div v-else class="hint-text">Not commonly used with this service.</div>
            </div>

            <div v-if="url" class="hint-section">
                <div class="hint-label"><i class="fa-solid fa-link" /> URL</div>
                <div class="hint-url">
                    <code>{{ url }}</code>
                </div>
            </div>

            <div class="d-flex justify-content-end mt-3">
                <Button severity="secondary" label="Close" @click="$emit('close')" />
            </div>
        </div>
    </Window>
</template>

<script>
import Window from '@/components/HubWindow';
import Button from 'primevue/button';
import { OGC_USAGE_HINTS } from '@/libs/ogcShareUrls';

export default {
    components: { Window, Button },
    props: {
        service: { type: String, required: true },
        url: { type: String, default: '' }
    },
    emits: ['close'],
    computed: {
        hints() {
            return OGC_USAGE_HINTS[this.service] || {
                title: this.service,
                qgis: '', arcgis: '', gdal: '-', notes: ''
            };
        }
    }
};
</script>

<style scoped>
.content { min-width: min(28rem, var(--window-content-width, 100%)); max-width: 38rem; }
.hint-section { margin-top: 0.75rem; }
.hint-label {
    font-weight: 600;
    color: var(--ddb-text-secondary);
    margin-bottom: 0.25rem;
    font-size: var(--ddb-font-size-sm);
}
.hint-text { font-size: 0.95rem; line-height: 1.4; }
.hint-text code,
.hint-url code {
    display: block;
    background: var(--ddb-bg-subtle);
    padding: 0.4rem 0.6rem;
    border-radius: 0.25rem;
    font-family: monospace;
    font-size: 0.85rem;
    word-break: break-all;
}
</style>
