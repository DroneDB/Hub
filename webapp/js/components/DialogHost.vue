<template>
    <component :is="d.component || components[d.name]" v-for="d in dialogs.stack.value" :key="d.id"
               v-bind="d.props" @close="(...args) => d.finish(args[0])" />
</template>

<script setup>
/**
 * Renders the dialogs opened with useDialogs() (HQ-07/HQ-09). Named dialogs are looked
 * up in `components` ({ name: component }, lazy imports welcome).
 */
defineOptions({ name: 'DialogHost' });

defineProps({
    // the object returned by useDialogs()
    dialogs: { type: Object, required: true },
    components: { type: Object, default: () => ({}) }
});
</script>
