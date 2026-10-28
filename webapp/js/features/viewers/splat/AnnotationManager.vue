<template>
    <Window id="splat-pins" title="Pins" fixed-size size-class="dialog-md" @close="emit('close')">
        <div class="pins-manager">
            <SavedItemList :items="pins" name-key="title" :active-index="activeIndex" :can-write="canWrite" noun="pin"
                           empty-text="No pins yet. Add one, then click where it goes on the scene."
                           goto-title="Show this pin" update-title="Save the current view with this pin"
                           @goto="i => emit('goto', i)" @update="i => emit('update-view', i)" @move="e => emit('move', e)"
                           @delete="i => emit('delete', i)" @rename="e => emit('rename', e)" />

            <form v-if="canWrite && active" class="pin-editor" @submit.prevent>
                <label :for="`${id}-text`">Text <small>(Markdown)</small></label>
                <textarea :id="`${id}-text`" rows="4" :value="active.text" @change="edit({ text: $event.target.value })" />

                <label :for="`${id}-link`">Link</label>
                <input :id="`${id}-link`" type="url" placeholder="https://" :value="active.link" :aria-invalid="!!linkError"
                       @change="onLink($event.target)">
                <small v-if="linkError" class="field-error">{{ linkError }}</small>

                <label :for="`${id}-image`">Image</label>
                <input :id="`${id}-image`" type="text" placeholder="photos/gate.jpg" :value="active.image" :aria-invalid="!!imageError"
                       @change="onImage($event.target)">
                <small v-if="imageError" class="field-error">{{ imageError }}</small>
                <small v-else class="field-hint">The path of a picture in this dataset.</small>
            </form>

            <small class="hint">
                Clicking a pin flies to the view saved with it, and the tour visits the pins that have one, in this order.
            </small>

            <SavedItemsFooter add-label="Add a pin" :can-write="canWrite" :dirty="dirty"
                              read-only-note="pins can be viewed but not saved."
                              @add="emit('add')" @save="emit('save')" @close="emit('close')" />
        </div>
    </Window>
</template>

<script setup>
/**
 * AnnotationManager - the panel of the pins of a splat, next to the camera views panel: the list
 * (a name, the view the pin flies to, the order of the tour) and, for the pin on show, its text,
 * link and image. A link must be a web address and an image a path inside the dataset; a value
 * that is neither is refused with a message instead of being kept and dropped when the file is read.
 */
import { ref, computed, watch, useId } from 'vue';
import Window from '@/components/HubWindow.vue';
import { isWebUrl } from '@/libs/sanitize';
import SavedItemList from './SavedItemList.vue';
import SavedItemsFooter from './SavedItemsFooter.vue';
import { isDatasetPath } from './sceneData';

const props = defineProps({
    /** @type {import('vue').PropType<import('./sceneData').Annotation[]>} */
    pins: { type: Array, required: true },
    canWrite: { type: Boolean, default: false },
    dirty: { type: Boolean, default: false },
    activeIndex: { type: Number, default: null }
});
const emit = defineEmits(['goto', 'update-view', 'move', 'delete', 'rename', 'edit', 'add', 'save', 'close']);

const id = useId();
const active = computed(() => (props.activeIndex === null ? null : props.pins[props.activeIndex] ?? null));
const linkError = ref('');
const imageError = ref('');
// Another pin: the messages were about the one before
watch(() => props.activeIndex, () => { linkError.value = ''; imageError.value = ''; });

const edit = changes => emit('edit', { index: props.activeIndex, changes });

/** A field is applied when it is empty or valid; otherwise the message says what it wants and the old value comes back. */
function apply(input, field, valid, message, error) {
    const value = input.value.trim();
    if (value && !valid(value)) {
        error.value = message;
        input.value = active.value[field];
        return;
    }
    error.value = '';
    edit({ [field]: value });
}
const onLink = input => apply(input, 'link', isWebUrl, 'A link must be a web address, starting with https:// or http://.', linkError);
const onImage = input => apply(input, 'image', isDatasetPath, 'The image must be a path inside this dataset, like photos/gate.jpg.', imageError);
</script>

<style scoped>
.pins-manager {
    display: flex;
    flex-direction: column;
    gap: var(--ddb-spacing-sm);
    min-width: min(24rem, var(--window-content-width, 100%));
}

.pin-editor {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding-top: var(--ddb-spacing-sm);
}

.pin-editor input,
.pin-editor textarea {
    padding: 0.3rem 0.4rem;
    border: 1px solid var(--ddb-border);
    border-radius: var(--ddb-radius-sm);
    background: var(--ddb-bg-surface);
    color: var(--ddb-text);
    font: inherit;
}

.pin-editor input[aria-invalid="true"] {
    border-color: var(--ddb-danger);
}

.field-error {
    color: var(--ddb-danger);
}

.field-hint,
.hint {
    color: var(--ddb-text-muted);
}
</style>
