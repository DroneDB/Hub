<template>
    <Window id="splat-cameras" title="Camera views" fixed-size size-class="dialog-md" @close="$emit('close')">
        <div class="cameras-manager">
            <p v-if="!cameras.length" class="empty">
                No camera views yet. Move to a viewpoint and add it below.
            </p>

            <ul v-else class="camera-list">
                <li v-for="(cam, i) in cameras" :key="cam.id"
                    class="camera-row" :class="{ active: i === activeIndex }">
                    <span class="idx" :title="`Press ${i} to jump here`">{{ i }}</span>
                    <input v-model.trim="cam.name" class="name" type="text" :aria-label="`Name of view ${i}`"
                           :readonly="!canWrite"
                           @change="$emit('rename', { index: i, name: cam.name })">
                    <div class="actions">
                        <button class="act" title="Go to this view" aria-label="Go to this view" @click="$emit('goto', i)">
                            <i class="fa-solid fa-eye" />
                        </button>
                        <button v-if="canWrite" class="act" title="Replace with the current view" aria-label="Replace with the current view"
                                @click="$emit('update-current', i)">
                            <i class="fa-solid fa-camera-rotate" />
                        </button>
                        <button v-if="canWrite" class="act" :disabled="i === 0"
                                title="Move up" aria-label="Move up" @click="$emit('move', { index: i, dir: -1 })">
                            <i class="fa-solid fa-arrow-up" />
                        </button>
                        <button v-if="canWrite" class="act" :disabled="i === cameras.length - 1"
                                title="Move down" aria-label="Move down" @click="$emit('move', { index: i, dir: 1 })">
                            <i class="fa-solid fa-arrow-down" />
                        </button>
                        <button v-if="canWrite" class="act danger" title="Remove this view" aria-label="Remove this view"
                                @click="$emit('delete', i)">
                            <i class="fa-solid fa-trash" />
                        </button>
                    </div>
                </li>
            </ul>

            <small class="hint">
                Tips: press <b>0-9</b> to jump to a view, <b>-</b>/<b>+</b> to cycle, <b>P</b> to resume the tour.
            </small>

            <div class="manager-footer">
                <Button v-if="canWrite" label="Add current view" icon="fa-solid fa-plus"
                        text @click="$emit('add-current')" />
                <span class="spacer" />
                <Button v-if="canWrite" :label="dirty ? 'Save *' : 'Save'"
                        :disabled="!dirty" @click="$emit('save')" />
                <Button label="Close" severity="secondary" text @click="$emit('close')" />
            </div>

            <small v-if="!canWrite" class="readonly-note">
                <i class="fa-solid fa-lock" /> Read-only access: camera views can be viewed but not saved.
            </small>
        </div>
    </Window>
</template>

<script>
import Window from '@/components/HubWindow.vue';
import Button from 'primevue/button';

export default {
    name: 'CameraManager',
    components: { Window, Button },
    props: {
        cameras: { type: Array, required: true },
        canWrite: { type: Boolean, default: false },
        dirty: { type: Boolean, default: false },
        activeIndex: { type: Number, default: null }
    },
    emits: ['goto', 'add-current', 'update-current', 'delete', 'move', 'rename', 'save', 'close']
};
</script>

<style scoped>
.cameras-manager {
    display: flex;
    flex-direction: column;
    gap: var(--ddb-spacing-sm);
    min-width: 22rem;
}

.cameras-manager .empty {
    color: var(--ddb-text-muted);
    text-align: center;
    margin: var(--ddb-spacing-md) 0;
}

.cameras-manager .camera-list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 50vh;
    overflow-y: auto;
}

.cameras-manager .camera-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.25rem 0.15rem;
    border-bottom: 1px solid var(--ddb-border);
}

.cameras-manager .camera-row.active {
    background: var(--ddb-bg-hover);
    border-radius: var(--ddb-radius-sm);
}

.cameras-manager .idx {
    flex: 0 0 1.4rem;
    text-align: center;
    font-weight: 600;
    color: var(--ddb-text-muted);
}

.cameras-manager .name {
    flex: 1 1 auto;
    min-width: 0;
    padding: 0.25rem 0.4rem;
    border: 1px solid var(--ddb-border);
    border-radius: var(--ddb-radius-sm);
    background: var(--ddb-bg-surface);
    color: var(--ddb-text);
}

.cameras-manager .name[readonly] {
    background: transparent;
    border-color: transparent;
}

.cameras-manager .actions {
    display: flex;
    gap: 0.15rem;
}

.cameras-manager .act {
    width: 1.9rem;
    height: 1.9rem;
    border: none;
    border-radius: var(--ddb-radius-sm);
    background: transparent;
    color: var(--ddb-text);
    cursor: pointer;
}

.cameras-manager .act:hover:not(:disabled) {
    background: var(--ddb-bg-hover);
}

.cameras-manager .act:disabled {
    opacity: 0.35;
    cursor: default;
}

.cameras-manager .act.danger:hover {
    color: var(--ddb-danger);
}

.cameras-manager .hint {
    color: var(--ddb-text-muted);
}

.cameras-manager .manager-footer {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    margin-top: var(--ddb-spacing-sm);
}

.cameras-manager .manager-footer .spacer {
    flex: 1 1 auto;
}

.cameras-manager .readonly-note {
    color: var(--ddb-text-muted);
}

.cameras-manager .readonly-note i {
    margin-right: 0.3rem;
}
</style>
