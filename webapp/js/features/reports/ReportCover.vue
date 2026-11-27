<template>
    <header class="report-cover" data-section-part="cover">
        <div v-if="part.logo" class="report-cover-top">
            <LogoBlock :block="part.logo" />
        </div>
        <div class="report-cover-band">
            <div class="report-cover-titles">
                <h2 v-if="part.title" class="report-cover-title">{{ part.title.text }}</h2>
                <p v-if="part.subtitle" class="report-cover-subtitle">{{ part.subtitle.text }}</p>
            </div>
            <div v-if="part.qr" class="report-cover-qr">
                <QrBlock :block="part.qr" compact />
            </div>
        </div>
        <dl v-if="part.facts" class="report-cover-facts">
            <div v-for="row in part.facts.rows" :key="row.label" class="report-cover-fact">
                <dt>{{ row.label }}</dt>
                <dd>{{ row.value }}</dd>
            </div>
        </dl>
        <KpisBlock v-if="part.kpis" :block="part.kpis" />
        <ReportBlock v-for="(block, index) in part.rest" :key="index" :block="block" />
        <div v-if="part.map" class="report-cover-map">
            <MapSnapshotBlock :block="part.map" />
        </div>
    </header>
</template>

<script setup>
/**
 * The cover of the live report, as the PDF lays it out: the logo, a band of the primary colour of the template with the
 * title, the subtitle and the QR code of the live page, the facts of the report (prepared by and for, date, dataset), its
 * headline figures and the overview map. The blocks are the model's (libs/reports/reportParts gives them by their place).
 */
import LogoBlock from './blocks/LogoBlock.vue';
import QrBlock from './blocks/QrBlock.vue';
import KpisBlock from './blocks/KpisBlock.vue';
import MapSnapshotBlock from './blocks/MapSnapshotBlock.vue';
import ReportBlock from './ReportBlock.vue';

defineProps({
    /** The cover part (libs/reports/reportParts) */
    part: { type: Object, required: true }
});
</script>

<style scoped>
.report-cover {
    margin-bottom: var(--ddb-spacing-xl);
}

.report-cover-top :deep(.report-logo) {
    height: 3.5rem;
    margin-bottom: var(--ddb-spacing-md);
}

.report-cover-band {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--ddb-spacing-md);
    padding: var(--ddb-spacing-xl) var(--ddb-spacing-lg);
    border-bottom: 5px solid var(--report-accent, var(--ddb-primary));
    border-radius: var(--ddb-radius-md, 0.5rem) var(--ddb-radius-md, 0.5rem) 0 0;
    background:
        linear-gradient(110deg, var(--report-primary, var(--ddb-primary)) 0 62%,
            color-mix(in srgb, var(--report-primary, var(--ddb-primary)) 88%, var(--ddb-text-on-color)) 62% 100%);
    color: var(--report-on-primary, var(--ddb-text-on-color));
}

.report-cover-titles {
    flex: 1 1 18rem;
    min-width: 0;
}

.report-cover-title {
    margin: 0;
    font-size: clamp(1.6rem, 4vw, 2.4rem);
    line-height: 1.15;
}

.report-cover-subtitle {
    margin: var(--ddb-spacing-sm) 0 0;
    font-size: 1.05rem;
    opacity: 0.85;
}

.report-cover-qr {
    flex: none;
    padding: var(--ddb-spacing-sm);
    border-radius: var(--ddb-radius-sm);
    background: var(--ddb-bg);
    color: var(--ddb-text);
}

.report-cover-facts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    gap: var(--ddb-spacing-md);
    margin: var(--ddb-spacing-lg) 0;
}

.report-cover-fact {
    padding-left: var(--ddb-spacing-sm);
    border-left: 3px solid var(--report-accent, var(--ddb-primary));
}

.report-cover-fact dt {
    color: var(--ddb-text-secondary);
    font-size: var(--ddb-font-size-xs, 0.75rem);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
}

.report-cover-fact dd {
    margin: 0;
    font-weight: 600;
    overflow-wrap: anywhere;
}

.report-cover-map :deep(.report-figure-frame) {
    max-width: none;
    border-radius: var(--ddb-radius-md, 0.5rem);
    box-shadow: var(--ddb-shadow-md);
}
</style>
