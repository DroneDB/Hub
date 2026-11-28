<template>
    <section class="template-preview" aria-labelledby="template-preview-title">
        <h4 id="template-preview-title" class="template-preview-title">Preview</h4>
        <div class="page" :class="template.orientation" :style="pageStyle" data-test="preview-page">
            <div class="top">
                <img v-if="logoSrc" :src="logoSrc" alt="Logo" class="logo">
                <span class="header-text">{{ template.headerText }}</span>
            </div>
            <header class="band" :style="{ background: primary, color: bandText, borderColor: accent }">
                <p class="title">Inspection report</p>
                <p class="subtitle">North pit &middot; prepared for Acme Quarries</p>
            </header>
            <div class="content">
                <ul class="tiles" aria-hidden="true">
                    <li v-for="tile in TILES" :key="tile.label" :style="{ borderColor: tile.colour || primary }">
                        <b :style="{ color: tile.colour || primary }">{{ tile.value }}</b>{{ tile.label }}
                    </li>
                </ul>
                <div class="sample" :style="{ borderColor: accent }">
                    <span class="ref" :style="{ background: accent, color: accentText }">1</span>
                    <span class="sample-text">Crack in the north wall <span class="chip" :style="{ color: accent }">Defect</span></span>
                </div>
                <!-- eslint-disable-next-line vue/no-v-html -- renderMarkdown sanitises (markdown-it, then DOMPurify) -->
                <div v-if="disclaimerHtml" class="disclaimer" v-html="disclaimerHtml" />
            </div>
            <footer class="foot" :style="{ borderColor: accent }">{{ template.footerText }}</footer>
        </div>
        <small class="d-block mt-1 text-muted">A sample page with the values being edited; the report itself may break differently.</small>
    </section>
</template>

<script setup>
/**
 * A page of the template being edited, laid out as the cover of a report: its paper and orientation, the logo and the
 * header text, the title on a band of the primary colour over a stripe of the accent colour, the headline figures, a
 * sample item with its reference on the accent colour, the disclaimer (markdown) and the footer text. It shows the
 * values as they are typed; nothing is saved from here.
 */
import { computed } from 'vue';
import { renderMarkdown } from '@/libs/markdown';
import { PRIMARY } from '@/libs/palette';
import { readableTextOn, isColour, DEFAULT_TEMPLATE } from '@/libs/reports/reportSettings';
import { CLOSED_COLOUR, OVERDUE_COLOUR } from '@/libs/reports/reportStyling';

// The headline figures of a sample report, in the colours of their tones (the neutral one is the primary colour)
const TILES = Object.freeze([
    { label: 'Items', value: 12, colour: null },
    { label: 'Open', value: 5, colour: PRIMARY[500] },
    { label: 'Overdue', value: 2, colour: OVERDUE_COLOUR },
    { label: 'Closed', value: 7, colour: CLOSED_COLOUR }
]);

const props = defineProps({
    /** The template being edited */
    template: { type: Object, required: true },
    /** Where its logo is, when it has one that is stored */
    logoSrc: { type: String, default: '' }
});

// A colour that is not (yet) a colour reads as the default one, so that the preview never goes blank
const primary = computed(() => (isColour(props.template.primary) ? props.template.primary : DEFAULT_TEMPLATE.primary));
const accent = computed(() => (isColour(props.template.accent) ? props.template.accent : DEFAULT_TEMPLATE.accent));
const bandText = computed(() => readableTextOn(primary.value));
const accentText = computed(() => readableTextOn(accent.value));
const disclaimerHtml = computed(() => renderMarkdown(props.template.disclaimer, { allowImages: false }));

// The side ratio of the paper: A4 210 x 297 mm, Letter 8.5 x 11 in
const pageStyle = computed(() => {
    const [short, long] = props.template.paper === 'Letter' ? [8.5, 11] : [210, 297];
    return { aspectRatio: props.template.orientation === 'landscape' ? `${long} / ${short}` : `${short} / ${long}` };
});
</script>

<style scoped>
.template-preview-title {
    font-size: 1rem;
    margin: 0 0 var(--ddb-spacing-xs);
}

/* A sheet of paper: its colours are the paper's, in the dark theme too */
.page {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 22rem;
    overflow: hidden;
    background: var(--ddb-paper);
    color: rgba(var(--ddb-shade-rgb), 0.87);
    border: var(--ddb-border-width) solid var(--ddb-border);
    box-shadow: var(--ddb-shadow-sm);
    font-size: 0.75rem;
}

.page.landscape {
    max-width: 32rem;
}

.top {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 2rem;
    padding: 0.4rem 0.6rem;
    font-weight: 600;
}

.logo {
    max-height: 1.75rem;
    max-width: 6rem;
    object-fit: contain;
}

.band {
    padding: 0.6rem;
    border-bottom: 3px solid;
}

.title {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 700;
}

.subtitle {
    margin: 0.15rem 0 0;
    opacity: 0.8;
}

.content {
    flex: 1 1 auto;
    min-height: 0;
    padding: 0.6rem;
    overflow: hidden;
}

.tiles {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.3rem;
    margin: 0 0 0.6rem;
    padding: 0;
    list-style: none;
    font-size: 0.6rem;
}

.tiles li {
    display: flex;
    flex-direction: column;
    padding: 0.2rem 0.3rem;
    border-top: 3px solid;
    background: rgba(var(--ddb-shade-rgb), 0.05);
}

.tiles b {
    font-size: 0.95rem;
    line-height: 1.1;
}

.sample {
    display: flex;
    align-items: stretch;
    border-bottom: 2px solid;
    background: rgba(var(--ddb-shade-rgb), 0.05);
}

.ref {
    display: flex;
    align-items: center;
    padding: 0.3rem 0.5rem;
    font-weight: 800;
}

.sample-text {
    padding: 0.3rem 0.5rem;
    font-weight: 600;
}

.chip {
    margin-left: 0.3rem;
    padding: 0 0.4rem;
    border-radius: 999px;
    background: rgba(var(--ddb-shade-rgb), 0.08);
    font-size: 0.65rem;
}

.disclaimer {
    margin-top: 0.6rem;
    font-size: 0.65rem;
    color: rgba(var(--ddb-shade-rgb), 0.65);
}

.disclaimer :deep(p) {
    margin: 0 0 0.3rem;
}

.foot {
    padding: 0.3rem 0.6rem;
    border-top: 2px solid;
    color: rgba(var(--ddb-shade-rgb), 0.65);
    font-size: 0.65rem;
    min-height: 1.4rem;
}
</style>
