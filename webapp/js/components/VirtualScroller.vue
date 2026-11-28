/**
 * VirtualScroller - Vue 3 wrapper around @tanstack/vue-virtual.
 * Drop-in replacement for vue-virtual-scroller's RecycleScroller.
 *
 * Props:
 *   items       - Array of items to render
 *   itemSize    - Estimated height per item in pixels (default: 35)
 *   minHeight   - Minimum height of the scroll container (default: 200)
 *   itemKey     - What identifies an item: the name of its property (e.g. 'id') or a function (item, index) => key.
 *                 Without it rows are keyed by their position, so when items are added or removed a row keeps the
 *                 state of its component (an expanded text, a focused field) and shows another item with it.
 *
 * Slot:
 *   Receives { item } for each visible item, same as RecycleScroller's v-slot.
 *
 * Exposes scrollToIndex(index) and scrollElement.
 */
<template>
    <div
        ref="parentRef"
        class="virtual-scroller"
        :style="{ minHeight: minHeight + 'px' }"
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
    required: true
  },
  itemSize: {
    type: Number,
    default: 35
  },
  minHeight: {
    type: Number,
    default: 200
  },
  itemKey: {
    type: [String, Function],
    default: null
  }
});

// The key of the item at `index`: its own identity when the caller names one, else its position
function keyOf(items, itemKey, index) {
  const item = items[index];
  if (itemKey == null || item == null) return index;
  const key = typeof itemKey === 'function' ? itemKey(item, index) : item[itemKey];
  return key ?? index;
}

const parentRef = ref(null);

// Wrap options in computed() so that reactive props (count, itemSize, the items themselves) are tracked. The key
// function is made again when the items are another array: the virtualizer keeps the keys of its rows until it gets
// another function, and a row keyed for an item that moved would show the wrong one.
// useVirtualizer accepts MaybeRef<Options>.
const virtualizer = useVirtualizer(computed(() => {
  const { items, itemKey } = props;
  return {
    count: items.length,
    getScrollElement: () => parentRef.value,
    estimateSize: () => props.itemSize,
    getItemKey: index => keyOf(items, itemKey, index),
    overscan: 5,
  };
}));

// IMPORTANT: in <script setup>, refs need .value to access the inner value.
// In <template>, top-level refs are auto-unwrapped by Vue, so `totalSize`
// and `virtualItems` are used directly (as number and array).
// Calling `virtualizer.value.method()` directly in the template is WRONG
// because `virtualizer` is auto-unwrapped to a Virtualizer object, which
// has no `.value` property - resulting in undefined.getTotalSize() errors.
const virtualItems = computed(() => virtualizer.value.getVirtualItems());
const totalSize = computed(() => virtualizer.value.getTotalSize());

watch(() => props.items.length, async () => {
  await nextTick();
  virtualizer.value.measure();
});

// Another item size (the same count): the rows are placed again at the new size before they are drawn
watch(() => props.itemSize, () => virtualizer.value.measure());

// For parents: scroll to a row, and the element that scrolls (e.g. an IntersectionObserver root)
defineExpose({
  scrollToIndex: (index) => virtualizer.value.scrollToIndex(index, { align: 'start' }),
  get scrollElement() {
    return parentRef.value;
  }
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
