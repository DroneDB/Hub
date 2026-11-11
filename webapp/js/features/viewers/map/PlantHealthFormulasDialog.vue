<template>
    <Window id="plant-health-formulas" :visible="visible" title="Vegetation index formulas" modal fixed-position
            width="640px" max-width="95vw" height="auto" close-button cancel-label="Close"
            @update:visible="$emit('update:visible', $event)">
        <div class="info-dialog-body">
            <p class="info-intro">
                Each formula combines spectral bands to highlight a specific
                aspect of plant or terrain condition. Pick the index that best
                matches what you want to inspect.
            </p>

            <div v-for="entry in entries" :key="entry.id" class="formula-card">
                <h4>
                    <span class="formula-id">{{ entry.id }}</span>
                    <span class="formula-name">{{ entry.name }}</span>
                </h4>
                <p class="line"><b>What it measures:</b> {{ entry.measures }}</p>
                <p v-if="entry.expression" class="line">
                    <b>Formula:</b> <code>{{ entry.expression }}</code>
                </p>
                <p v-if="entry.bands" class="line"><b>Bands required:</b> {{ entry.bands }}</p>
                <p v-if="entry.when" class="line"><b>When to use:</b> {{ entry.when }}</p>
                <p v-if="entry.disabled" class="line unavailable">
                    <i class="fas fa-ban" />
                    Not available on this raster: {{ entry.disabledReason }}
                </p>
            </div>

            <p v-if="entries.length === 0" class="empty-hint">
                No formulas are available for this raster.
            </p>
        </div>

    </Window>
</template>

<script>
import Window from '@/components/HubWindow.vue';

// Curated copy for the formulas of ddb (DDBGetRasterMetadata lists 18). It holds what the list cannot: what an index
// measures and when to use it, each text its own. Anything not listed here shows the help of the list as what it
// measures and has no "when to use". The bands come from the list (`requiredBands`).
const FORMULA_INFO = {
    VARI: {
        measures: 'the fraction of green vegetation in ordinary RGB photos, with less sensitivity to the atmosphere.',
        when: 'RGB cameras: a quick check of crop cover when the camera has no NIR band.'
    },
    EXG: {
        measures: 'the greenness of foliage against soil and residue.',
        when: 'separating plants from soil in RGB orthophotos, to count plants or map weeds.'
    },
    GLI: {
        measures: 'green leaf cover using only the RGB bands, from -1 to 1.',
        when: 'comparing the green cover of fields photographed with a standard RGB camera (no NIR).'
    },
    vNDVI: {
        measures: 'an approximation of NDVI computed from the RGB bands.',
        when: 'RGB-only flights where you still want an NDVI-like picture of plant vigor.'
    },
    NDVI: {
        measures: 'overall vegetation vigor and biomass density.',
        when: 'general crop health monitoring; the most common starting point.'
    },
    NDWI: {
        measures: 'leaf and canopy water content.',
        when: 'irrigation checks and drought stress detection.'
    },
    GNDVI: {
        measures: 'chlorophyll concentration; more sensitive than NDVI in dense canopies.',
        when: 'late-stage crop monitoring and chlorophyll variability.'
    },
    SAVI: {
        measures: 'vegetation with a soil-adjustment factor (L = 0.5).',
        when: 'sparse cover or early growth stages where soil dominates the signal; reflectance rasters only.'
    },
    EVI: {
        measures: 'vegetation while correcting for atmosphere and soil background.',
        when: 'forested areas or dense canopies where NDVI saturates; reflectance rasters only.'
    },
    NDRE: {
        measures: 'nitrogen content and chlorophyll in mid-to-late season crops.',
        when: 'mature canopies where NDVI saturates; nitrogen management.'
    },
    NDYI: {
        measures: 'yellowness: the yellow of flowers, and of stressed or ripening leaves.',
        when: 'flowering crops such as canola, and spotting yellowing.'
    },
    MPRI: {
        measures: 'a modified photochemical reflectance index from the green and red bands, a proxy of plant pigment change.',
        when: 'spotting early stress changes of the canopy with a green and a red band.'
    },
    OSAVI: {
        measures: 'vegetation with a fixed soil-adjustment factor of 0.16.',
        when: 'young crops and orchards with bare soil between the plants; reflectance rasters only.'
    },
    GRVI: {
        measures: 'the ratio of NIR to green, a measure of green biomass with no fixed range.',
        when: 'comparing biomass between dates or plots with the same sensor.'
    },
    ENDVI: {
        measures: 'plant health using the blue band, reducing soil noise.',
        when: 'cameras that record blue, green and NIR (a modified RGB camera, for example).'
    },
    ARVI: {
        measures: 'vegetation with a correction for the atmosphere, using the blue band.',
        when: 'flights through haze or smoke, where the atmosphere changes NDVI.'
    },
    CELSIUS: {
        measures: 'the temperature in degrees Celsius, as the thermal band gives it.',
        when: 'thermal rasters: hot spots, water stress and heat loss.'
    },
    KELVIN: {
        measures: 'the same temperature in kelvin (K).',
        when: 'a model or a report that needs absolute temperatures.'
    }
};

export default {
    name: 'PlantHealthFormulasDialog',
    components: { Window },
    props: {
        visible: { type: Boolean, default: false },
        formulas: { type: Array, default: () => [] }
    },
    emits: ['update:visible'],
    computed: {
        entries() {
            return (this.formulas || []).map(f => {
                const id = f.id || f.name || '';
                const curated = FORMULA_INFO[id] || null;
                const help = (f.help && String(f.help).trim()) || '';
                return {
                    id,
                    name: f.name || id,
                    expression: f.expr || '',
                    // The bands the formula reads: the structured list of ddb
                    bands: Array.isArray(f.requiredBands) ? f.requiredBands.join(', ') : '',
                    measures: curated ? curated.measures : (help || 'See product documentation for details.'),
                    // Only the curated text says when: the help is not repeated
                    when: curated ? curated.when : '',
                    disabled: !!f.disabled,
                    disabledReason: f.disabledReason || ''
                };
            });
        }
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
    border: 1px solid var(--p-content-border-color);
    border-radius: 0.4rem;
    padding: 0.6rem 0.8rem;
    margin-bottom: 0.6rem;
    background: rgba(var(--ddb-ink-rgb), 0.03);
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
    color: var(--ddb-success-text);
}

.formula-name {
    opacity: 0.85;
    font-weight: 400;
}

.line {
    margin: 0.2rem 0;
}

.line code {
    background: rgba(var(--ddb-ink-rgb), 0.08);
    padding: 0.05rem 0.3rem;
    border-radius: 0.2rem;
    font-size: 0.85rem;
}

.unavailable {
    color: var(--ddb-danger);
}

.unavailable i {
    margin-right: 0.3rem;
}

.empty-hint {
    opacity: 0.7;
    font-style: italic;
}
</style>
