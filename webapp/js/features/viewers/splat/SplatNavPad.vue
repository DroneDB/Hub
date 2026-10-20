<template>
    <!-- Keyboard recap that doubles as press-and-hold buttons (mouse and touch) -->
    <div class="nav-controls" :class="{ touch }">
        <div class="nav-grid">
            <button v-for="k in NAV_KEYS" :key="k.code" class="nav-key" :class="{ active: pressed[k.code] }"
                    :title="`${k.label} (${k.letter})`" :aria-label="k.label"
                    @pointerdown.prevent="press(k.code, $event)" @pointerup="emit('release', k.code)"
                    @pointerleave="emit('release', k.code)" @pointercancel="emit('release', k.code)" @contextmenu.prevent>
                <i :class="k.icon" />
                <span class="letter">{{ k.letter }}</span>
            </button>
        </div>
    </div>
</template>

<script setup>
/**
 * The splat viewer's movement pad (HQ-08, out of Splat.vue), laid out like the keys:
 *   Q (down)  W (forward)  E (up)
 *   A (left)  S (backward) D (right)
 */
defineProps({
    /** code -> held (highlights the key) */
    pressed: { type: Object, required: true },
    /** Larger buttons on touch devices */
    touch: { type: Boolean, default: false }
});
const emit = defineEmits(['press', 'release']);

const NAV_KEYS = [
    { code: 'KeyQ', letter: 'Q', label: 'Down', icon: 'fa-solid fa-angle-down' },
    { code: 'KeyW', letter: 'W', label: 'Forward', icon: 'fa-solid fa-arrow-up' },
    { code: 'KeyE', letter: 'E', label: 'Up', icon: 'fa-solid fa-angle-up' },
    { code: 'KeyA', letter: 'A', label: 'Left', icon: 'fa-solid fa-arrow-left' },
    { code: 'KeyS', letter: 'S', label: 'Backward', icon: 'fa-solid fa-arrow-down' },
    { code: 'KeyD', letter: 'D', label: 'Right', icon: 'fa-solid fa-arrow-right' }
];

// The button keeps the pointer while held, so release fires even off the button
function press(code, ev) {
    try { ev.currentTarget.setPointerCapture(ev.pointerId); } catch { /* not capturable */ }
    emit('press', code);
}
</script>

<style scoped>
/* Immersive navigation recap / touch pad (bottom-right). */
.nav-controls {
    position: absolute;
    bottom: var(--ddb-spacing-md);
    right: var(--ddb-spacing-md);
    user-select: none;
    touch-action: none;
}

.nav-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.3rem;
}

.nav-key {
    position: relative;
    width: 2.6rem;
    height: 2.6rem;
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: var(--ddb-border-radius, 6px);
    background: rgba(0, 0, 0, 0.4);
    color: var(--ddb-text-on-dark);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1rem;
    transition: background 0.1s ease;
}

.nav-key:hover {
    background: rgba(0, 0, 0, 0.6);
}

.nav-key:active,
.nav-key.active {
    background: rgba(40, 110, 190, 0.8);
    border-color: rgba(120, 180, 255, 0.9);
}

.nav-key .letter {
    position: absolute;
    bottom: 0.1rem;
    right: 0.25rem;
    font-size: 0.6rem;
    opacity: 0.8;
}

/* Larger, more reachable buttons on touch devices. */
.nav-controls.touch .nav-key {
    width: 3.4rem;
    height: 3.4rem;
    background: rgba(0, 0, 0, 0.5);
    font-size: 1.2rem;
}
</style>
