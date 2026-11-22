<template>
    <section class="template-preview" aria-labelledby="template-preview-title">
        <h4 id="template-preview-title" class="template-preview-title">Preview</h4>
        <div class="page" :class="template.orientation" :style="pageStyle" data-test="preview-page">
            <header class="band" :style="{ background: primary, color: bandText }">
                <img v-if="logoSrc" :src="logoSrc" alt="Logo" class="logo">
                <span class="header-text">{{ template.headerText }}</span>
            </header>
            <div class="content">
                <p class="title" :style="{ color: primary }">Inspection report</p>
                <p class="subtitle">North pit &middot; prepared for Acme Quarries</p>
                <div class="sample" :style="{ borderColor: accent }">
                    <span class="chip" :style="{ background: accent, color: accentText }">Defect</span>
                    <span class="sample-text">1 &middot; Crack in the north wall</span>
                </div>
                <!-- eslint-disable-next-line vue/no-v-html -- renderMarkdown sanitises (markdown-it, then DOMPurify) -->
                <div v-if="disclaimerHtml" class="disclaimer" v-html="disclaimerHtml" />
            </div>
            <footer class="foot">{{ template.footerText }}</footer>
        </div>
        <small class="d-block mt-1 text-muted">A sample page with the values being edited; the report itself may break differently.</small>
    </section>
</template>

<script setup>
/**
 * A page of the template being edited: its paper and orientation, the logo and header text on a band in the
 * primary colour, a sample item in the accent colour, the disclaimer (markdown) and the footer text. It shows the
 * values as they are typed; nothing is saved from here.
 */
import { computed } from 'vue';
import { renderMarkdown } from '@/libs/markdown';
import { readableTextOn, isColour, DEFAULT_TEMPLATE } from '@/libs/reports/reportSettings';

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

.band {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 2.25rem;
    padding: 0.4rem 0.6rem;
    font-weight: 600;
}

.logo {
    max-height: 1.75rem;
    max-width: 6rem;
    object-fit: contain;
}

.content {
    flex: 1 1 auto;
    min-height: 0;
    padding: 0.6rem;
    overflow: hidden;
}

.title {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 700;
}

.subtitle {
    margin: 0 0 0.6rem;
    color: rgba(var(--ddb-shade-rgb), 0.65);
}

.sample {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.3rem 0.4rem;
    border-left: 4px solid;
    background: rgba(var(--ddb-shade-rgb), 0.06);
}

.chip {
    padding: 0 0.4rem;
    border-radius: 999px;
    font-weight: 600;
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
    border-top: 1px solid rgba(var(--ddb-shade-rgb), 0.2);
    color: rgba(var(--ddb-shade-rgb), 0.65);
    font-size: 0.65rem;
    min-height: 1.4rem;
}
</style>
