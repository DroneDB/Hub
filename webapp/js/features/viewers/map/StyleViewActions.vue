<template>
    <!-- Two buttons and no box of their own: they are items of the footer row of the panel (.panel-footer-row) -->
    <button type="button" class="panel-btn footer-btn" :title="resetTitle" :aria-label="resetAriaLabel || undefined"
            data-testid="style-view-reset" @click="emit('reset')">
        <i class="fas fa-rotate-left" aria-hidden="true" />
        <span class="footer-label">Reset</span>
    </button>
    <!-- A toggle: pressed while the original is shown, with the look of a pressed tool in every panel -->
    <button type="button" class="panel-btn footer-btn" :class="{ 'is-active': originalView }" :aria-pressed="String(originalView)"
            :title="originalView ? 'Show the analyzed raster' : 'Show the original raster (no styling applied)'"
            :aria-label="originalAriaLabel || undefined" data-testid="style-view-original" @click="emit('toggleOriginal')">
        <i :class="originalView ? 'fas fa-eye-slash' : 'fas fa-eye'" aria-hidden="true" />
        <span class="footer-label">{{ originalView ? 'Hide orig.' : 'Original' }}</span>
    </button>
</template>

<script setup>
/**
 * StyleViewActions - the Reset and Original buttons of the footer of a panel that styles a raster (Raster Analysis, Plant
 * Health): Reset puts the style back to its defaults, Original shows the raster without the style while it is pressed. The
 * panel does both; this only draws the buttons the same way in each, and says which was pressed.
 */
defineOptions({ name: 'StyleViewActions' });

defineProps({
    /** The original raster is shown (Original is pressed) */
    originalView: { type: Boolean, default: false },
    /** The title of Reset: what the panel resets */
    resetTitle: { type: String, required: true },
    /** The accessible name of Reset, when it is not its label */
    resetAriaLabel: { type: String, default: '' },
    /** The accessible name of Original, when it is not its label */
    originalAriaLabel: { type: String, default: '' }
});

const emit = defineEmits(['reset', 'toggleOriginal']);
</script>
