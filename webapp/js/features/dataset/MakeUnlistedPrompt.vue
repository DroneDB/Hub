<template>
    <div class="make-unlisted">
        <p class="mb-2">
            This dataset is Private: only its members can open these links. To share them with anyone,
            make the dataset Unlisted.
        </p>
        <Button icon="fa-solid fa-unlock" label="Make the dataset Unlisted..." @click="$emit('makeUnlisted')" />
    </div>
</template>

<script>
import Button from 'primevue/button';

// What the Share window shows for a Private dataset: its links work only for members, and
// sharing them changes the visibility of the whole dataset (the window asks first)
export default {
    name: 'MakeUnlistedPrompt',
    components: { Button },
    emits: ['makeUnlisted']
};
</script>
