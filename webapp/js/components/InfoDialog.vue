<template>
    <Window :id="id" :title="title" modal fixed-size size-class="dialog-lg"
            close-modal-on-click @close="$emit('close')" @confirm="$emit('close')">
        <div class="info-dialog">
            <p class="info-summary">
                <i v-if="icon" :class="icon" class="me-2" aria-hidden="true" />{{ summary }}
            </p>

            <template v-for="section in sections" :key="section.heading">
                <h5>{{ section.heading }}</h5>
                <p v-if="section.text"><InfoLine :line="section.text" /></p>
                <ul v-if="section.items?.length">
                    <li v-for="(line, i) in section.items" :key="i"><InfoLine :line="line" /></li>
                </ul>
            </template>

            <p v-if="docsUrl" class="info-docs">
                <a :href="docsUrl" target="_blank" rel="noopener noreferrer">
                    Learn more in the documentation <i class="fa-solid fa-arrow-up-right-from-square ms-1" aria-hidden="true" />
                </a>
            </p>
        </div>

        <template #footer>
            <Button label="Close" data-autofocus @click="$emit('close')" />
        </template>
    </Window>
</template>

<script>
import { h } from 'vue';
import Window from '@/components/HubWindow.vue';
import Button from 'primevue/button';

/**
 * A line of the dialog: plain text, or a list of text and buttons ({ label, icon? }), a button being its icon and its
 * label in bold, as the user sees it on the page.
 */
const InfoLine = {
    name: 'InfoLine',
    props: { line: { type: [String, Array], required: true } },
    setup: props => () => (typeof props.line === 'string' ? [props.line] : props.line).map(part => (typeof part === 'string'
        ? part
        : h('span', { class: 'ui-ref' }, [part.icon && h('i', { class: part.icon, 'aria-hidden': 'true' }), h('strong', part.label)])))
};

/**
 * InfoDialog - explains something of the Hub (an entry type, a group of the dataset page): a summary, then headed
 * sections of a paragraph and/or a list, and a link to the documentation page; Close closes it. All text is shown as
 * text; a line can name buttons with their icon, so the user knows what to look for.
 */
export default {
    name: 'InfoDialog',
    components: { Window, Button, InfoLine },
    props: {
        /** DOM id of the dialog */
        id: { type: String, required: true },
        title: { type: String, required: true },
        /** The glyph before the summary */
        icon: { type: String, default: '' },
        summary: { type: String, required: true },
        /** [{ heading, text?, items? }]: a heading, then a paragraph, a list or both; a line is text, or text and buttons (InfoLine) */
        sections: { type: Array, default: () => [] },
        /** The documentation page; none shows no link */
        docsUrl: { type: String, default: '' }
    },
    emits: ['close']
};
</script>

<style scoped>
.info-dialog h5 {
    margin: 0.85rem 0 0.25rem;
    font-size: 0.95rem;
    font-weight: 600;
}

.info-dialog p,
.info-dialog ul {
    margin: 0;
}

.info-dialog ul {
    padding-left: 1.25rem;
}

.info-dialog p + ul {
    margin-top: 0.25rem;
}

/* The lines are rendered by InfoLine, which has no root element of its own for the scope to land on */
.info-dialog :deep(.ui-ref) {
    white-space: nowrap;
}

.info-dialog :deep(.ui-ref i) {
    margin-right: 0.3em;
}

.info-summary {
    font-size: 1.05rem;
}

.info-docs {
    margin-top: 0.85rem !important;
}
</style>
