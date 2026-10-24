<template>
    <div class="camera-rail">
        <div v-if="cameras.length" class="rail-cameras">
            <button v-for="(cam, i) in cameras" :key="cam.id" class="rail-btn cam" :class="{ active: i === activeIndex }"
                    :title="cam.name || `Camera ${i + 1}`" :aria-label="cam.name || `Camera ${i + 1}`" @click="emit('goto', i)">
                {{ i + 1 }}
            </button>
        </div>
        <div v-if="cameras.length" class="rail-sep" />
        <button class="rail-btn" :class="{ active: mode === 'orbit' }" :title="mode === 'orbit' ? 'Stop orbit' : 'Start orbit'"
                :aria-label="mode === 'orbit' ? 'Stop orbit' : 'Start orbit'" @click="emit('toggle-orbit')">
            <i :class="mode === 'orbit' ? 'fa-solid fa-pause' : 'fa-solid fa-arrows-rotate'" />
        </button>
        <button v-if="cameras.length" class="rail-btn" :class="{ active: mode === 'tour' }"
                :title="mode === 'tour' ? 'Stop cycling' : 'Start cycling'" :aria-label="mode === 'tour' ? 'Stop cycling' : 'Start cycling'"
                @click="emit('toggle-tour')">
            <i class="fa-solid fa-camera-rotate" />
        </button>
        <template v-if="canWrite">
            <button class="rail-btn" title="Save current view as a camera" aria-label="Save current view as a camera" @click="emit('add')">
                <i class="fa-solid fa-camera" />
            </button>
            <button class="rail-btn" :class="{ dirty }" :disabled="!dirty" title="Save cameras to dataset"
                    aria-label="Save cameras to dataset" @click="emit('save')">
                <i class="fa-solid fa-floppy-disk" />
            </button>
        </template>
    </div>
</template>

<script setup>
/**
 * The splat viewer's left-edge camera rail: jump to a saved
 * camera, toggle the orbit or the tour, save the current view and the cameras.
 */
defineProps({
    cameras: { type: Array, required: true },
    activeIndex: { type: Number, default: null },
    /** Presentation mode: 'orbit', 'tour', 'transition' or null */
    mode: { type: String, default: null },
    canWrite: { type: Boolean, default: false },
    dirty: { type: Boolean, default: false }
});
const emit = defineEmits(['goto', 'toggle-orbit', 'toggle-tour', 'add', 'save']);
</script>

<style scoped>
/* Left-edge camera rail (vertically centered): jump between saved cameras,
   toggle the auto-orbit, save the current view, and persist to the dataset. */
.camera-rail {
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
    max-height: 82%;
    overflow-y: auto;
    padding: 0.35rem 0.3rem;
    background: rgba(0, 0, 0, 0.35);
    border-radius: 0 var(--ddb-radius-sm) var(--ddb-radius-sm) 0;
    user-select: none;
}

.camera-rail .rail-cameras {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
}

.rail-btn {
    width: 2.1rem;
    height: 2.1rem;
    flex: 0 0 auto;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: var(--ddb-radius-sm);
    background: rgba(0, 0, 0, 0.5);
    color: var(--ddb-text-on-dark);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.85rem;
    transition: background 0.1s ease, border-color 0.1s ease;
}

.rail-btn:hover:not(:disabled) {
    background: rgba(0, 0, 0, 0.75);
}

.rail-btn.active {
    background: rgba(40, 110, 190, 0.85);
    border-color: rgba(120, 180, 255, 0.9);
}

.rail-btn.dirty {
    border-color: rgba(240, 180, 60, 0.9);
}

.rail-btn:disabled {
    opacity: 0.4;
    cursor: default;
}

.camera-rail .rail-sep {
    width: 70%;
    height: 1px;
    background: rgba(255, 255, 255, 0.25);
    margin: 0.1rem 0;
}
</style>
