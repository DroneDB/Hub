<template>
    <InfoDialog id="entry-type-info" :title="title" :icon="icon" :summary="info?.summary || 'This type has no description.'" :sections="sections"
                :docs-url="info?.docsUrl || ''" @close="$emit('close')" />
</template>

<script>
import InfoDialog from '@/components/InfoDialog.vue';
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
    components: { InfoDialog },
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
        },
        sections() {
            if (!this.info) return [];
            const { detection, contains, actions, examples } = this.info;
            return [
                { heading: 'How DroneDB recognizes it', text: detection },
                { heading: 'What its properties show', items: contains },
                { heading: 'What you can do with it', items: actions },
                { heading: 'Examples', items: examples }
            ];
        }
    }
};
</script>
