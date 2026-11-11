<template>
    <Window id="splat-cameras" title="Camera views" fixed-size size-class="dialog-md" @close="$emit('close')">
        <div class="cameras-manager">
            <SavedItemList :items="cameras" :active-index="activeIndex" :can-write="canWrite" noun="view"
                           empty-text="No camera views yet. Move to a viewpoint and add it below."
                           goto-title="Go to this view" update-title="Replace with the current view"
                           :index-title="i => (i < 9 ? `Press ${i + 1} to jump here` : null)"
                           @goto="i => $emit('goto', i)" @update="i => $emit('update-current', i)" @move="e => $emit('move', e)"
                           @delete="i => $emit('delete', i)" @rename="e => $emit('rename', e)" />

            <small class="hint">
                Tips: press <b>1-9</b> to jump to a view, <b>-</b>/<b>+</b> to cycle, <b>P</b> to resume the tour.
            </small>

            <SavedItemsFooter add-label="Add current view" :can-write="canWrite" :dirty="dirty"
                              read-only-note="camera views can be viewed but not saved."
                              @add="$emit('add-current')" @save="$emit('save')" @close="$emit('close')" />
        </div>
    </Window>
</template>

<script>
import Window from '@/components/HubWindow.vue';
import SavedItemList from './SavedItemList.vue';
import SavedItemsFooter from './SavedItemsFooter.vue';

export default {
    name: 'CameraManager',
    components: { Window, SavedItemList, SavedItemsFooter },
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
    min-width: min(22rem, var(--window-content-width, 100%));
}

.cameras-manager .hint {
    color: var(--ddb-text-muted);
}
</style>
