<template>
    <Window title="Camera views" id="splat-cameras" @onClose="$emit('close')" fixedSize sizeClass="dialog-sm">
        <div class="cameras-manager">
            <p v-if="!cameras.length" class="empty">
                No camera views yet. Move to a viewpoint and add it below.
            </p>

            <ul v-else class="camera-list">
                <li v-for="(cam, i) in cameras" :key="cam.id"
                    class="camera-row" :class="{ active: i === activeIndex }">
                    <span class="idx" :title="`Press ${i} to jump here`">{{ i }}</span>
                    <input class="name" type="text" v-model.trim="cam.name"
                        :readonly="!canWrite"
                        @change="$emit('rename', { index: i, name: cam.name })" />
                    <div class="actions">
                        <button class="act" @click="$emit('goto', i)" title="Go to this view">
                            <i class="fa-solid fa-eye" />
                        </button>
                        <button v-if="canWrite" class="act" @click="$emit('update-current', i)"
                            title="Replace with the current view">
                            <i class="fa-solid fa-camera-rotate" />
                        </button>
                        <button v-if="canWrite" class="act" @click="$emit('move', { index: i, dir: -1 })"
                            :disabled="i === 0" title="Move up">
                            <i class="fa-solid fa-arrow-up" />
                        </button>
                        <button v-if="canWrite" class="act" @click="$emit('move', { index: i, dir: 1 })"
                            :disabled="i === cameras.length - 1" title="Move down">
                            <i class="fa-solid fa-arrow-down" />
                        </button>
                        <button v-if="canWrite" class="act danger" @click="$emit('delete', i)"
                            title="Remove this view">
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
                    @click="$emit('add-current')" text />
                <span class="spacer"></span>
                <Button v-if="canWrite" :label="dirty ? 'Save *' : 'Save'"
                    :disabled="!dirty" @click="$emit('save')" />
                <Button label="Close" severity="secondary" @click="$emit('close')" text />
            </div>

            <small v-if="!canWrite" class="readonly-note">
                <i class="fa-solid fa-lock" /> Read-only access: camera views can be viewed but not saved.
            </small>
        </div>
    </Window>
</template>

<script>
import Window from '@/components/Window.vue';
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
    gap: var(--ddb-spacing-sm, 0.5rem);
    min-width: 22rem;
}

.cameras-manager .empty {
    color: var(--ddb-text-muted, #888);
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
    border-bottom: 1px solid var(--ddb-border-color, rgba(0, 0, 0, 0.08));
}

.cameras-manager .camera-row.active {
    background: var(--ddb-surface-hover, rgba(40, 110, 190, 0.12));
    border-radius: var(--ddb-border-radius, 4px);
}

.cameras-manager .idx {
    flex: 0 0 1.4rem;
    text-align: center;
    font-weight: 600;
    color: var(--ddb-text-muted, #888);
}

.cameras-manager .name {
    flex: 1 1 auto;
    min-width: 0;
    padding: 0.25rem 0.4rem;
    border: 1px solid var(--ddb-border-color, rgba(0, 0, 0, 0.15));
    border-radius: var(--ddb-border-radius, 4px);
    background: var(--ddb-surface, #fff);
    color: var(--ddb-text, #222);
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
    border-radius: var(--ddb-border-radius, 4px);
    background: transparent;
    color: var(--ddb-text, #444);
    cursor: pointer;
}

.cameras-manager .act:hover:not(:disabled) {
    background: var(--ddb-surface-hover, rgba(0, 0, 0, 0.07));
}

.cameras-manager .act:disabled {
    opacity: 0.35;
    cursor: default;
}

.cameras-manager .act.danger:hover {
    color: var(--ddb-danger, #c0392b);
}

.cameras-manager .hint {
    color: var(--ddb-text-muted, #888);
}

.cameras-manager .manager-footer {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    margin-top: var(--ddb-spacing-sm, 0.5rem);
}

.cameras-manager .manager-footer .spacer {
    flex: 1 1 auto;
}

.cameras-manager .readonly-note {
    color: var(--ddb-text-muted, #888);
}

.cameras-manager .readonly-note i {
    margin-right: 0.3rem;
}
</style>
