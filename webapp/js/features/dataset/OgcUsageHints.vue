<template>
    <Window title="How to use this OGC service" id="ogc-usage-hints" modal fixedSize @onClose="$emit('onClose')">
        <div class="content">
            <h4 class="mt-0">{{ hints.title }}</h4>

            <div class="hint-section">
                <div class="hint-label"><i class="fa-solid fa-circle-info"></i> About</div>
                <div class="hint-text">{{ hints.notes }}</div>
            </div>

            <div class="hint-section">
                <div class="hint-label"><i class="fa-solid fa-map"></i> QGIS</div>
                <div class="hint-text">{{ hints.qgis }}</div>
            </div>

            <div class="hint-section">
                <div class="hint-label"><i class="fa-solid fa-earth-americas"></i> ArcGIS Pro</div>
                <div class="hint-text">{{ hints.arcgis }}</div>
            </div>

            <div class="hint-section">
                <div class="hint-label"><i class="fa-solid fa-terminal"></i> GDAL / OGR</div>
                <div class="hint-text" v-if="hints.gdal !== '—'">
                    <code>{{ hints.gdal.replace('<capabilities-url>', url).replace('<landing-url>', url) }}</code>
                </div>
                <div class="hint-text" v-else>Not commonly used with this service.</div>
            </div>

            <div class="hint-section" v-if="url">
                <div class="hint-label"><i class="fa-solid fa-link"></i> URL</div>
                <div class="hint-url">
                    <code>{{ url }}</code>
                </div>
            </div>

            <div class="d-flex justify-content-end mt-3">
                <Button @click="$emit('onClose')" severity="secondary" label="Close" />
            </div>
        </div>
    </Window>
</template>

<script>
import Window from '@/components/Window';
import Button from 'primevue/button';
import { OGC_USAGE_HINTS } from '@/libs/ogcShareUrls';

export default {
    components: { Window, Button },
    props: {
        service: { type: String, required: true },
        url: { type: String, default: '' }
    },
    emits: ['onClose'],
    computed: {
        hints() {
            return OGC_USAGE_HINTS[this.service] || {
                title: this.service,
                qgis: '', arcgis: '', gdal: '—', notes: ''
            };
        }
    }
};
</script>

<style scoped>
.content { min-width: 28rem; max-width: 38rem; }
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
    background: var(--ddb-surface-section, #f4f4f4);
    padding: 0.4rem 0.6rem;
    border-radius: 0.25rem;
    font-family: monospace;
    font-size: 0.85rem;
    word-break: break-all;
}
</style>
