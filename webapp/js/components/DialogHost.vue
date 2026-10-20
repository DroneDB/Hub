<template>
    <component :is="d.component || components[d.name]" v-for="d in dialogs.stack.value" :key="d.id"
               v-bind="typeof d.props === 'function' ? d.props() : d.props" @close="(...args) => d.finish(args[0])" />
</template>

<script setup>
/**
 * Renders the dialogs opened with useDialogs() (HQ-07/HQ-09). Named dialogs are looked
 * up in `components` ({ name: component }, lazy imports welcome). Props given as a
 * function are re-read on every render, so they follow reactive state.
 */
defineOptions({ name: 'DialogHost' });

defineProps({
    // the object returned by useDialogs()
    dialogs: { type: Object, required: true },
    components: { type: Object, default: () => ({}) }
});
</script>
