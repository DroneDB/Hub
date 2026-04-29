<template>
    <Dialog :visible="visible"
            @update:visible="onVisibleChange"
            modal
            header="Vegetation index formulas"
            :style="{ width: '640px' }"
            :draggable="false">
        <div class="info-dialog-body">
            <p class="info-intro">
                Each formula combines spectral bands to highlight a specific
                aspect of plant or terrain condition. Pick the index that best
                matches what you want to inspect.
            </p>

            <div class="formula-card" v-for="entry in entries" :key="entry.id">
                <h4>
                    <span class="formula-id">{{ entry.id }}</span>
                    <span class="formula-name">{{ entry.name }}</span>
                </h4>
                <p class="line"><b>What it measures:</b> {{ entry.measures }}</p>
                <p class="line" v-if="entry.expression">
                    <b>Formula:</b> <code>{{ entry.expression }}</code>
                </p>
                <p class="line"><b>Bands required:</b> {{ entry.bands }}</p>
                <p class="line"><b>When to use:</b> {{ entry.when }}</p>
                <p class="line unavailable" v-if="entry.disabled">
                    <i class="fas fa-ban"></i>
                    Not available on this raster: {{ entry.disabledReason }}
                </p>
            </div>

            <p class="empty-hint" v-if="entries.length === 0">
                No formulas are available for this raster.
            </p>
        </div>

        <template #footer>
            <Button label="Close" icon="fas fa-times" severity="secondary"
                    @click="onClose" />
        </template>
    </Dialog>
</template>

<script>
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';

// Curated copy for the most common multispectral indices. Anything not listed
// here falls back to the descriptions provided by the backend.
// `bands` mirrors the requiredBands field in the DDB C++ formula struct.
const FORMULA_INFO = {
    NDVI: {
        measures: 'overall vegetation vigor and biomass density.',
        bands: 'Red, NIR',
        when: 'general crop health monitoring; the most common starting point.'
    },
    NDRE: {
        measures: 'nitrogen content and chlorophyll in mid-to-late season crops.',
        bands: 'Red Edge, NIR',
        when: 'mature canopies where NDVI saturates; nitrogen management.'
    },
    NDWI: {
        measures: 'leaf and canopy water content.',
        bands: 'Green, NIR',
        when: 'irrigation checks and drought stress detection.'
    },
    GNDVI: {
        measures: 'chlorophyll concentration; more sensitive than NDVI in dense canopies.',
        bands: 'Green, NIR',
        when: 'late-stage crop monitoring and chlorophyll variability.'
    },
    ENDVI: {
        measures: 'plant health using the blue band, reducing soil noise.',
        bands: 'Green, Blue, NIR',
        when: 'sensors that lack a true NIR band but have NDVI-like requirements.'
    },
    EVI: {
        measures: 'vegetation while correcting for atmosphere and soil background.',
        bands: 'Red, Blue, NIR',
        when: 'forested areas or dense canopies where NDVI saturates.'
    },
    EVI2: {
        measures: 'EVI without the blue band; lighter and more robust.',
        bands: 'Red, NIR',
        when: 'sensors without a blue band; quick canopy assessment.'
    },
    SAVI: {
        measures: 'vegetation with a soil-adjustment factor (L).',
        bands: 'Red, NIR',
        when: 'sparse cover or early growth stages where soil dominates the signal.'
    },
    MSAVI2: {
        measures: 'a self-adjusting variant of SAVI.',
        bands: 'Red, NIR',
        when: 'very sparse vegetation; emerging crops on bare soil.'
    },
    MCARI2: {
        measures: 'chlorophyll content with reduced soil and LAI bias.',
        bands: 'Red, Red Edge, NIR',
        when: 'precision agriculture focused on chlorophyll status.'
    },
    GLI: {
        measures: 'green leaf cover using only RGB bands.',
        bands: 'Red, Green, Blue',
        when: 'standard RGB cameras (no NIR).'
    },
    BAI: {
        measures: 'burned area / fire-affected vegetation.',
        bands: 'Red, NIR',
        when: 'post-fire damage assessment and burn severity mapping.'
    }
};

export default {
    name: 'PlantHealthFormulasDialog',
    components: { Dialog, Button },
    props: {
        visible: { type: Boolean, default: false },
        formulas: { type: Array, default: () => [] }
    },
    emits: ['update:visible'],
    computed: {
        entries() {
            return (this.formulas || []).map(f => {
                const id = f.id || f.name || '';
                const curated = FORMULA_INFO[String(id).toUpperCase()] || null;
                const help = (f.help && String(f.help).trim()) || '';
                return {
                    id,
                    name: f.name || id,
                    expression: f.expr || '',
                    bands: this._formatBands(f, curated),
                    measures: curated ? curated.measures : (help || 'See product documentation for details.'),
                    when: curated ? curated.when : (help || 'Use when this index is part of your standard workflow.'),
                    disabled: !!f.disabled,
                    disabledReason: f.disabledReason || ''
                };
            });
        }
    },
    methods: {
        _formatBands(f, curated) {
            // 1. Use curated band info if available (most reliable source)
            if (curated && curated.bands) return curated.bands;
            // 2. Extract from disabledReason: DDB emits "Requires bands: Red, NIR"
            if (f.disabledReason && f.disabledReason.startsWith('Requires bands: ')) {
                return f.disabledReason.slice('Requires bands: '.length);
            }
            // 3. Fall back gracefully
            return 'see formula expression above';
        },
        onVisibleChange(v) { this.$emit('update:visible', v); },
        onClose() { this.$emit('update:visible', false); }
    }
};
</script>

<style scoped>
.info-dialog-body {
    font-size: 0.9rem;
    line-height: 1.45;
    max-height: 65vh;
    overflow-y: auto;
}

.info-intro {
    margin: 0 0 1rem 0;
}

.formula-card {
    border: 1px solid var(--p-content-border-color, rgba(255, 255, 255, 0.15));
    border-radius: 0.4rem;
    padding: 0.6rem 0.8rem;
    margin-bottom: 0.6rem;
    background: rgba(255, 255, 255, 0.03);
}

.formula-card h4 {
    margin: 0 0 0.4rem 0;
    font-size: 1rem;
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
}

.formula-id {
    font-weight: 700;
    color: #4caf50;
}

.formula-name {
    opacity: 0.85;
    font-weight: 400;
}

.line {
    margin: 0.2rem 0;
}

.line code {
    background: rgba(0, 0, 0, 0.25);
    padding: 0.05rem 0.3rem;
    border-radius: 0.2rem;
    font-size: 0.85rem;
}

.unavailable {
    color: #ef9a9a;
}

.unavailable i {
    margin-right: 0.3rem;
}

.empty-hint {
    opacity: 0.7;
    font-style: italic;
}
</style>
