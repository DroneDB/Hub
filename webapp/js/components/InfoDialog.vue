<template>
    <Window :id="id" :title="title" modal fixed-size size-class="dialog-lg"
            close-modal-on-click @close="$emit('close')" @confirm="$emit('close')">
        <div class="info-dialog">
            <p class="info-summary">
                <i v-if="icon" :class="icon" class="me-2" aria-hidden="true" />{{ summary }}
            </p>

            <template v-for="section in sections" :key="section.heading">
                <h5>{{ section.heading }}</h5>
                <p v-if="section.text">{{ section.text }}</p>
                <ul v-if="section.items?.length">
                    <li v-for="line in section.items" :key="line">{{ line }}</li>
                </ul>
            </template>

            <p v-if="docsUrl" class="info-docs">
                <a :href="docsUrl" target="_blank" rel="noopener noreferrer">
                    Learn more in the documentation <i class="fa-solid fa-arrow-up-right-from-square ms-1" aria-hidden="true" />
                </a>
            </p>
        </div>

        <template #footer>
            <Button label="OK" icon="fa-solid fa-check" data-autofocus @click="$emit('close')" />
        </template>
    </Window>
</template>

<script>
import Window from '@/components/HubWindow.vue';
import Button from 'primevue/button';

/**
 * InfoDialog - explains something of the Hub (an entry type, a group of the dataset page): a summary, then headed
 * sections of a paragraph and/or a list, and a link to the documentation page. All text is shown as text.
 */
export default {
    name: 'InfoDialog',
    components: { Window, Button },
    props: {
        /** DOM id of the dialog */
        id: { type: String, required: true },
        title: { type: String, required: true },
        /** The glyph before the summary */
        icon: { type: String, default: '' },
        summary: { type: String, required: true },
        /** [{ heading, text?, items? }]: a heading, then a paragraph, a list or both */
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

.info-summary {
    font-size: 1.05rem;
}

.info-docs {
    margin-top: 0.85rem !important;
}
</style>
