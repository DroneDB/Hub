<template>
    <Window id="updateNotesDialog" :title="title" modal fixed-size size-class="dialog-lg" @close="$emit('close')">
        <p v-if="info.isSecurityUpdate" class="security-line">
            <i class="fa-solid fa-shield-halved" aria-hidden="true" /> This update contains security fixes.
        </p>
        <!-- eslint-disable-next-line vue/no-v-html -- sanitised by renderMarkdown, images dropped -->
        <div class="release-notes" v-html="notesHtml" />

        <template #footer>
            <div class="footer-links">
                <a v-if="links.changes" :href="links.changes" target="_blank" rel="noopener">All changes on GitHub</a>
                <a v-if="links.licence" :href="links.licence" target="_blank" rel="noopener">Using Registry commercially? Get a licence</a>
            </div>
            <Button label="Close" severity="secondary" @click="$emit('close')" />
        </template>
    </Window>
</template>

<script setup>
/**
 * UpdateNotesDialog - what a new Registry release changes: its release notes, a link to
 * the full list of changes, and a link to request a licence for commercial use.
 * The notes come from outside the server, so they are rendered without images and sanitised.
 */
import { computed } from 'vue';
import Button from 'primevue/button';
import Window from '@/components/HubWindow.vue';
import { renderMarkdown } from '@/libs/markdown';
import { updateLinks } from '@/composables/useUpdateCheck';

defineOptions({ name: 'UpdateNotesDialog' });

const props = defineProps({
    /** The server's update info (UpdateInfoDto) */
    info: { type: Object, required: true }
});
defineEmits(['close']);

const title = computed(() => `Registry ${props.info.latestVersion} is available (installed: ${props.info.currentVersion})`);
const notesHtml = computed(() => renderMarkdown(props.info.releaseNotes, { allowImages: false }));
const links = computed(() => updateLinks(props.info));
</script>

<style scoped>
.security-line {
    font-weight: 600;
    color: var(--ddb-danger);
}

.release-notes {
    max-height: 50vh;
    overflow: auto;
}

.release-notes :deep(pre) {
    overflow: auto;
}

.footer-links {
    display: flex;
    flex-direction: column;
    gap: var(--ddb-spacing-xs);
    margin-right: auto;
}
</style>
