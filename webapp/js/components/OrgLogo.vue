<template>
    <!-- The logo of the organization; without one, or when it does not load (a Registry that has none to give, a
         refused read), its initials on its colour -->
    <img v-if="src" class="org-logo" :class="sizeClass" :src="src" :alt="decorative ? '' : label" @error="failedSrc = src">
    <span v-else class="org-logo org-logo-initials" :class="sizeClass" :style="look"
          v-bind="decorative ? { 'aria-hidden': 'true' } : { role: 'img', 'aria-label': label }">{{ initials }}</span>
</template>

<script setup>
/**
 * OrgLogo - the logo of an organization, in the one tile every page draws it in (the header of the organization, the
 * list, the breadcrumb, the pickers, the legend of the map). The image is the organization's `logoUrl` (a versioned
 * address of the Registry, so a new logo is a new address); an organization without one, and one whose image fails to
 * load, shows its initials on its colour (the colour the map gives it, `organizationColour`).
 *
 *   <OrgLogo :org="org" size="lg" />
 *   <OrgLogo :org="org" decorative />   next to the name, which says it already
 *
 * `colour` overrides the colour of the initials: the legend of the map passes the colour of its pin.
 */
import { computed, ref, watch } from 'vue';
import { organizationColour } from '@/libs/map/vectorColours';
import { initialsLook, orgInitials } from '@/libs/orgLogo';

defineOptions({ name: 'OrgLogo' });

const props = defineProps({
    /** The organization: its name and slug, and the address of its logo (null when it has none) */
    org: { type: Object, default: null },
    /** sm (the line of text), md (a row of a list), lg (the header of a page) */
    size: { type: String, default: 'md', validator: value => ['sm', 'md', 'lg'].includes(value) },
    /** The name is written next to the logo: the logo is for the eye only (no alternative text) */
    decorative: { type: Boolean, default: false },
    /** The colour of the initials; the organization's own when none is given */
    colour: { type: String, default: '' }
});

// The address that failed to load: a new logo (a new address) is tried again
const failedSrc = ref('');
const src = computed(() => {
    const url = props.org?.logoUrl;
    return url && url !== failedSrc.value ? url : '';
});
watch(() => props.org?.logoUrl, () => { failedSrc.value = ''; });

const sizeClass = computed(() => `org-logo-${props.size}`);
const label = computed(() => `Logo of ${props.org?.name || props.org?.slug || 'the organization'}`);
const initials = computed(() => orgInitials(props.org));
const look = computed(() => initialsLook(props.colour || organizationColour(props.org?.slug ?? '')));
</script>

<style scoped>
/* A tile of one size for every organization, so a list lines up whether the logos are wide or square; the logo
   is drawn whole (contain) on white, as a logo is made for a light page, in either theme */
.org-logo {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    border-radius: var(--ddb-radius-sm);
    overflow: hidden;
    vertical-align: middle;
}

img.org-logo {
    object-fit: contain;
    background: rgb(var(--ddb-glass-rgb));
    border: var(--ddb-border-width) solid var(--ddb-border-light);
}

.org-logo-initials {
    font-weight: 600;
    line-height: 1;
    letter-spacing: 0.02em;
    user-select: none;
}

.org-logo-sm { width: 1.25rem; height: 1.25rem; font-size: 0.5625rem; }
.org-logo-md { width: 1.75rem; height: 1.75rem; font-size: 0.75rem; }
.org-logo-lg { width: 3.5rem; height: 3.5rem; font-size: 1.25rem; border-radius: var(--ddb-radius-md); }
</style>
