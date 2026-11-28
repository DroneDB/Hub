<template>
    <component :is="component" v-if="component" :block="block" v-bind="extra" />
</template>

<script setup>
/**
 * One block of the report model, drawn by the component of its type (blocks/blockComponents). A type this page does
 * not know is left out, not an error: a model of a later version can have blocks an older page cannot draw.
 */
import { computed } from 'vue';
import { BLOCK_COMPONENTS } from './blocks/blockComponents';

const props = defineProps({
    block: { type: Object, required: true },
    /** The name of the item the block belongs to (the heading before it on an item page), for alternative texts */
    itemName: { type: String, default: '' }
});

const component = computed(() => BLOCK_COMPONENTS[props.block.type] ?? null);
const extra = computed(() => (props.block.type === 'photoGrid' ? { itemName: props.itemName } : {}));
</script>
