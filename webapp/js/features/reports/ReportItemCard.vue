<template>
    <article class="report-item" :style="itemColours" data-section-part="item">
        <header class="report-item-head">
            <span class="report-item-ref" aria-hidden="true">{{ heading.ref || NO_REF }}</span>
            <div class="report-item-titles">
                <h3 :id="heading.anchor || undefined" :tabindex="heading.anchor ? -1 : undefined" class="report-item-name">
                    <span class="visually-hidden">{{ heading.ref }}</span> {{ heading.name || heading.text }}
                    <a v-if="heading.anchor" class="report-item-anchor" :href="`#${heading.anchor}`" :aria-label="`Link to ${heading.text}`">
                        <i class="fa-solid fa-link" aria-hidden="true" />
                    </a>
                </h3>
                <p v-if="heading.kind" class="report-item-kind">{{ heading.kind }}</p>
                <ul v-if="heading.badges?.length" class="report-item-badges" aria-label="Category, severity and status">
                    <li v-for="badge in heading.badges" :key="badge.key" class="report-badge" :class="`tone-${badge.tone || 'plain'}`" :style="{ '--badge': badge.colour }">
                        {{ badge.label }}
                    </li>
                </ul>
            </div>
            <div class="report-item-actions">
                <a v-if="heading.viewerUrl" class="report-item-viewer" :href="heading.viewerUrl" target="_blank" rel="noopener">
                    <i class="fa-solid fa-up-right-from-square" aria-hidden="true" /> Open in viewer<span class="visually-hidden"> ({{ heading.text }}, opens in a new tab)</span>
                </a>
                <QrBlock v-if="part.qr" :block="part.qr" compact />
            </div>
        </header>

        <div class="report-item-body" :class="{ 'has-figures': part.figures.length }">
            <div v-if="part.figures.length" class="report-item-figures">
                <ReportBlock v-for="(block, index) in part.figures" :key="index" :block="block" />
            </div>
            <div class="report-item-side">
                <dl v-if="facts.length" class="report-item-facts">
                    <div v-for="row in facts" :key="row.key || row.label" class="report-item-fact">
                        <dt>{{ row.label }}</dt>
                        <dd>{{ row.value }}</dd>
                    </div>
                </dl>
                <div v-if="part.description" class="report-item-description">
                    <ReportBlock :block="part.description" />
                </div>
                <ReportBlock v-for="(block, index) in part.rest" :key="`rest-${index}`" :block="block" />
            </div>
        </div>

        <ReportBlock v-if="part.photos" :block="part.photos" :item-name="heading.text" />
    </article>
</template>

<script setup>
/**
 * The page of an item on the live report, as the PDF lays it out: a header with the reference on a square of the
 * item's colour, its name, kind and badges (category, severity, status, overdue: each a word, the colour says it again),
 * the viewer link and the QR code of its address; then its figures beside its facts and description, then its photos.
 * The heading is the item's anchor (`#item-<id>`), which the page scrolls to and focuses.
 */
import { computed } from 'vue';
import { itemFacts } from '@/libs/reports/reportParts';
import { NO_REF } from '@/libs/reports/reportItems';
import { textOn } from '@/libs/reports/reportStyling';
import QrBlock from './blocks/QrBlock.vue';
import ReportBlock from './ReportBlock.vue';

const props = defineProps({
    /** The item part (libs/reports/reportParts) */
    part: { type: Object, required: true }
});

const heading = computed(() => props.part.heading);
// The colour of the item (its category's), and the text written on it: white on a dark one, the ink on a light one
const itemColours = computed(() => (heading.value.colour ? { '--item-colour': heading.value.colour, '--item-on-colour': textOn(heading.value.colour) } : {}));
// The facts its header does not show already
const facts = computed(() => itemFacts(props.part.facts));
</script>

<style scoped>
.report-item {
    --item: var(--item-colour, var(--report-primary, var(--ddb-primary)));
    margin: var(--ddb-spacing-lg) 0 var(--ddb-spacing-xl);
    border: var(--ddb-border-width) solid var(--ddb-border);
    border-radius: var(--ddb-radius-md, 0.5rem);
    background: var(--ddb-bg);
    overflow: hidden;
    scroll-margin-top: var(--ddb-spacing-lg);
}

.report-item-head {
    display: flex;
    align-items: stretch;
    border-bottom: 2px solid var(--item);
    background: var(--ddb-bg-subtle);
}

.report-item-ref {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    min-width: 4.25rem;
    padding: 0 var(--ddb-spacing-sm);
    background: var(--item);
    color: var(--item-on-colour, var(--ddb-text-on-color));
    font-size: 1.3rem;
    font-weight: 800;
}

.report-item-titles {
    flex: 1;
    min-width: 0;
    padding: var(--ddb-spacing-sm) var(--ddb-spacing-md);
}

.report-item-name {
    margin: 0;
    font-size: 1.2rem;
}

.report-item-name:focus-visible {
    outline: 2px solid var(--ddb-primary);
    outline-offset: 2px;
}

.report-item-anchor {
    margin-left: var(--ddb-spacing-xs);
    font-size: var(--ddb-font-size-sm);
    opacity: 0.5;
}

.report-item-anchor:hover,
.report-item-anchor:focus-visible {
    opacity: 1;
}

.report-item-kind {
    margin: 0.15rem 0 var(--ddb-spacing-xs);
    color: var(--ddb-text-secondary);
    font-size: var(--ddb-font-size-xs, 0.75rem);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
}

.report-item-badges {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ddb-spacing-xs);
    margin: 0;
    padding: 0;
    list-style: none;
}

.report-badge {
    padding: 0.1rem 0.55rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--badge) 16%, var(--ddb-bg));
    color: color-mix(in srgb, var(--badge) 60%, var(--ddb-text));
    font-size: var(--ddb-font-size-xs, 0.75rem);
    font-weight: 700;
}

.report-badge.tone-alert {
    background: var(--badge);
    color: var(--ddb-text-on-color);
}

.report-item-actions {
    display: flex;
    flex: none;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--ddb-spacing-xs);
    padding: var(--ddb-spacing-sm) var(--ddb-spacing-md);
    font-size: var(--ddb-font-size-sm);
}

.report-item-body {
    display: grid;
    gap: var(--ddb-spacing-md);
    padding: var(--ddb-spacing-md);
}

.report-item-body.has-figures {
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
}

.report-item-figures :deep(.report-figure-frame) {
    max-width: none;
}

.report-item-facts {
    display: grid;
    grid-template-columns: minmax(6rem, max-content) 1fr;
    gap: 0;
    margin: 0 0 var(--ddb-spacing-md);
}

.report-item-fact {
    display: contents;
}

.report-item-fact dt,
.report-item-fact dd {
    padding: 0.3rem 0;
    border-bottom: var(--ddb-border-width) solid var(--ddb-border);
}

.report-item-fact dt {
    padding-right: var(--ddb-spacing-md);
    color: var(--ddb-text-secondary);
    font-size: var(--ddb-font-size-sm);
}

.report-item-fact dd {
    margin: 0;
    font-weight: 600;
    overflow-wrap: anywhere;
}

.report-item-description {
    padding: var(--ddb-spacing-sm) var(--ddb-spacing-md);
    border-left: 4px solid var(--item);
    border-radius: 0 var(--ddb-radius-sm) var(--ddb-radius-sm) 0;
    background: var(--ddb-bg-subtle);
}

.report-item-description :deep(p:last-child) {
    margin-bottom: 0;
}

.report-item > :deep(.report-photos),
.report-item > :deep([data-block="photoGrid"]) {
    padding: 0 var(--ddb-spacing-md) var(--ddb-spacing-md);
}

@media (width <= 48rem) {
    .report-item-head {
        flex-wrap: wrap;
    }

    .report-item-actions {
        flex-direction: row;
        align-items: center;
        width: 100%;
    }

    .report-item-body.has-figures {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
