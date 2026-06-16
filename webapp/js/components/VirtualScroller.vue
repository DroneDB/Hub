/**
 * VirtualScroller - Vue 3 wrapper around @tanstack/vue-virtual.
 * Drop-in replacement for vue-virtual-scroller's RecycleScroller.
 *
 * Props:
 *   items       - Array of items to render
 *   itemSize    - Estimated height per item in pixels (default: 35)
 *   keyField    - Property name to use as :key (default: 'id')
 *   minHeight   - Minimum height of the scroll container (default: 200)
 *   maxHeight   - Maximum height of the scroll container (default: none)
 *
 * Slot:
 *   Receives { item } for each visible item, same as RecycleScroller's v-slot.
 */
<template>
  <div
    ref="parentRef"
    class="virtual-scroller"
    :style="{
      minHeight: minHeight + 'px',
      maxHeight: maxHeight ? maxHeight + 'px' : 'none'
    }"
  >
    <div :style="{ height: totalSize + 'px', position: 'relative' }">
      <div
        v-for="virtualItem in virtualItems"
        :key="virtualItem.key"
        class="virtual-scroller-item"
        :style="{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: virtualItem.size + 'px',
          transform: `translateY(${virtualItem.start}px)`
        }"
      >
        <slot :item="items[virtualItem.index]" :index="virtualItem.index" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import { useVirtualizer } from '@tanstack/vue-virtual';

const props = defineProps({
  items: {
    type: Array,
    required: true,
    default: () => []
  },
  itemSize: {
    type: Number,
    default: 35
  },
  keyField: {
    type: String,
    default: 'id'
  },
  minHeight: {
    type: Number,
    default: 200
  },
  maxHeight: {
    type: [Number, String],
    default: null
  }
});

const parentRef = ref(null);

// Wrap options in computed() so that reactive props (count, itemSize)
// are tracked. useVirtualizer accepts MaybeRef<Options>.
const virtualizer = useVirtualizer(computed(() => ({
  count: props.items.length,
  getScrollElement: () => parentRef.value,
  estimateSize: () => props.itemSize,
  overscan: 5,
})));

// IMPORTANT: in <script setup>, refs need .value to access the inner value.
// In <template>, top-level refs are auto-unwrapped by Vue, so `totalSize`
// and `virtualItems` are used directly (as number and array).
// Calling `virtualizer.value.method()` directly in the template is WRONG
// because `virtualizer` is auto-unwrapped to a Virtualizer object, which
// has no `.value` property — resulting in undefined.getTotalSize() errors.
const virtualItems = computed(() => virtualizer.value.getVirtualItems());
const totalSize = computed(() => virtualizer.value.getTotalSize());

watch(() => props.items.length, async () => {
  await nextTick();
  virtualizer.value.measure();
});
</script>

<style scoped>
.virtual-scroller {
  width: 100%;
  overflow-y: auto;
  overflow-x: hidden;
}

.virtual-scroller-item {
  left: 0;
  width: 100%;
}
</style>
