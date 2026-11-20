<template>
    <Window id="entry-type-info" :title="title" modal fixed-size size-class="dialog-lg"
            close-modal-on-click @close="$emit('close')" @confirm="$emit('close')">
        <div v-if="info" class="type-info">
            <p class="type-info-summary">
                <i :class="icon" class="me-2" aria-hidden="true" />{{ info.summary }}
            </p>

            <h5>How DroneDB recognizes it</h5>
            <p>{{ info.detection }}</p>

            <h5>What its properties show</h5>
            <ul>
                <li v-for="line in info.contains" :key="line">{{ line }}</li>
            </ul>

            <h5>What you can do with it</h5>
            <ul>
                <li v-for="line in info.actions" :key="line">{{ line }}</li>
            </ul>

            <h5>Examples</h5>
            <ul>
                <li v-for="line in info.examples" :key="line">{{ line }}</li>
            </ul>

            <p v-if="info.docsUrl" class="type-info-docs">
                <a :href="info.docsUrl" target="_blank" rel="noopener noreferrer">
                    Learn more in the documentation <i class="fa-solid fa-arrow-up-right-from-square ms-1" aria-hidden="true" />
                </a>
            </p>
        </div>

        <template #footer>
            <Button label="OK" icon="fa-solid fa-check" data-autofocus @click="$emit('close')" />
        </template>
    </Window>
</template>

<script>
import Window from '@/components/HubWindow.vue';
import Button from 'primevue/button';
import { getEntryTypeInfo } from '@/libs/entryTypeInfo';
import { getTypeDisplayName } from '@/libs/entryTypes';
import icons from '@/libs/icons';

/**
 * EntryTypeInfoDialog - explains an entry type (GeoRaster, Point Cloud...): what it is,
 * how DroneDB recognizes it, what its properties show, what the Hub does with it, examples.
 *
 * Props:
 *   type - the entry type (a ddb.entry.type value)
 */
export default {
    name: 'EntryTypeInfoDialog',
    components: { Window, Button },
    props: {
        type: { type: Number, required: true }
    },
    emits: ['close'],
    computed: {
        info() {
            return getEntryTypeInfo(this.type);
        },
        title() {
            return `Type: ${getTypeDisplayName(this.type)}`;
        },
        icon() {
            return icons.getForType(this.type);
        }
    }
};
</script>

<style scoped>
.type-info h5 {
    margin: 0.85rem 0 0.25rem;
    font-size: 0.95rem;
    font-weight: 600;
}

.type-info p,
.type-info ul {
    margin: 0;
}

.type-info ul {
    padding-left: 1.25rem;
}

.type-info-summary {
    font-size: 1.05rem;
}

.type-info-docs {
    margin-top: 0.85rem !important;
}
</style>
