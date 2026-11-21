<template>
    <Tag :severity="look.severity" :icon="look.icon" :value="look.label">
        <!-- Content after the label, inside the tag (the caret of the visibility menu) -->
        <template v-if="$slots.default" #default>
            <span class="p-tag-label">{{ look.label }}</span>
            <slot />
        </template>
    </Tag>
</template>

<script setup>
/**
 * VisibilityTag - the visibility of a dataset or an organization (Public, Unlisted, Private) as a
 * tag, the same on every page. Other Tag attributes (rounded, class) pass through; the default slot
 * follows the label inside the tag.
 */
import { computed } from 'vue';
import Tag from 'primevue/tag';
import { visibilityLook } from '@/libs/visibility';

defineOptions({ name: 'VisibilityTag' });
const props = defineProps({
    /** A Visibility value of ddb; anything else shows as Private */
    visibility: { type: Number, default: null }
});

const look = computed(() => visibilityLook(props.visibility));
</script>
