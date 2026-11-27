<template>
    <div class="report-qr" :class="{ compact }" data-block="qr">
        <!-- The code is a picture of the address, which is also written out: the code is no way to read it for a screen reader -->
        <svg v-if="code" class="report-qr-code" role="img" :aria-label="`QR code: ${block.label}`" :viewBox="`0 0 ${code.size} ${code.size}`"
             shape-rendering="crispEdges" data-testid="qr-code">
            <rect :width="code.size" :height="code.size" fill="#fff" />
            <path :d="code.path" fill="#000" />
        </svg>
        <p v-if="compact" class="report-qr-label">
            <a :href="block.url">{{ block.label }}</a>
        </p>
        <p v-else class="report-qr-text">
            {{ block.label }}: <a :href="block.url">{{ block.url }}</a>
        </p>
    </div>
</template>

<script setup>
/**
 * The QR block: the address of the live report or of an item, as the QR code the PDF carries (the same code, from
 * libs/qr) and as a link. The encoder loads on demand; a code is drawn only for an address of this Hub, any other
 * address is the link alone.
 */
import { ref, watch } from 'vue';
import { isOriginUrl } from '@/libs/originUrl';

const props = defineProps({
    /** { url, label } */
    block: { type: Object, required: true },
    /** A small code with its label under it (the cover and the card of an item), the address being the link of the label */
    compact: { type: Boolean, default: false }
});

/** @type {import('vue').Ref<{ size: number, path: string } | null>} */
const code = ref(null);

watch(() => props.block.url, async url => {
    code.value = null;
    if (!isOriginUrl(url)) return;
    try {
        const { qrCode } = await import('@/libs/qr');
        if (url === props.block.url) code.value = qrCode(url);
    } catch (e) {
        // The address is shown as a link whatever happens to the code
        console.warn('The QR code could not be made:', e);
    }
}, { immediate: true });
</script>

<style scoped>
.report-qr {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ddb-spacing-md);
    margin-bottom: var(--ddb-spacing-md);
}

.report-qr-code {
    flex: none;
    width: 7rem;
    height: 7rem;
}

.report-qr.compact {
    flex-direction: column;
    gap: var(--ddb-spacing-xs);
    margin: 0;
}

.report-qr.compact .report-qr-code {
    width: 4.5rem;
    height: 4.5rem;
}

.report-qr-label {
    margin: 0;
    font-size: var(--ddb-font-size-xs, 0.75rem);
    text-align: center;
}

.report-qr-text {
    flex: 1 1 12rem;
    min-width: 0;
    margin: 0;
    font-size: var(--ddb-font-size-sm);
    overflow-wrap: anywhere;
}
</style>
