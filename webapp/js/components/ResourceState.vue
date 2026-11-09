<template>
    <section class="resource-state" :class="`resource-state-${kind}`" :aria-labelledby="headingId">
        <i class="resource-state-icon" :class="icon" />
        <h1 :id="headingId">{{ heading }}</h1>
        <p class="resource-state-text">{{ text }}</p>
        <div class="resource-state-actions">
            <!-- Embedded in another site (an iframe without the session cookie): the links open a new tab -->
            <RouterLink v-for="(link, i) in links" :key="link.label" :to="link.to"
                        :target="embed ? '_blank' : undefined" :rel="embed ? 'noopener' : undefined"
                        class="resource-state-action" :class="{ primary: i === 0 }">
                <i :class="link.icon" /> {{ link.label }}
            </RouterLink>
            <button v-if="signedInHere" type="button" class="resource-state-action" @click="signInAsAnotherUser($router)">
                <i class="fa-solid fa-right-to-bracket" /> Sign in as another user
            </button>
            <button v-if="canGoBack" type="button" class="resource-state-action" @click="goBack">
                <i class="fa-solid fa-arrow-left" /> Back
            </button>
        </div>
    </section>
</template>

<script setup>
/**
 * ResourceState - the one page state of a primary resource that cannot be shown (FR-XC-13):
 * not found, no access, sign in and invalid link. It replaces the page's content (the dataset
 * table of an organization, the panels of a dataset, a viewer), names what was asked for, says
 * why in plain words, and gives the ways out (SPA links): the page's own back target, Sign in
 * (back to this page afterwards; the way out of a visitor without a session, who has no
 * Organizations to go to), the user's datasets, Organizations, and Back. Embedded (?embed=1 or an
 * iframe), the links open a new tab and the actions that would act in the frame are left out.
 *
 *   <ResourceState v-if="loadKind" :kind="loadKind" resource="dataset" :name="$route.params.ds" />
 *
 * The kind comes from loadErrorKind(error) (libs/ddb/apiError.js). The heading is the page's
 * h1 and its title.
 */
import { computed, inject, watch, useId } from 'vue';
import reg from '@/libs/api/sharedRegistry';
import { setTitle } from '@/libs/utils';
import { loginLocation } from '@/libs/authRoutes';
import { currentPath } from '@/libs/routeQuery';
import { LoadErrorKind } from '@/libs/ddb/apiError';
import { useAuthStore } from '@/stores/auth';

const props = defineProps({
    /** A LoadErrorKind value: 'not-found', 'no-access', 'sign-in', 'invalid-link' */
    kind: {
        type: String, required: true,
        validator: value => Object.values(LoadErrorKind).includes(String(value))
    },
    /** What was asked for: 'organization', 'dataset', 'file', 'view' or 'page' */
    resource: { type: String, default: 'page' },
    /** Its name as the address gives it (a slug, a file path, the address of a page) */
    name: { type: String, default: '' },
    /** Says why in place of the kind's own text (the reason a link is not valid) */
    message: { type: String, default: '' },
    /** The page's own way back, first among the actions (a viewer: its dataset) */
    backTo: { type: [String, Object], default: null },
    backLabel: { type: String, default: 'Back' }
});

const headingId = useId();
// Provided by the app: the page is embedded in another one
const embed = inject('embed', false);

const signedIn = () => typeof reg.isLoggedIn === 'function' && reg.isLoggedIn();
const quoted = computed(() => (props.name ? `"${props.name}"` : `This ${props.resource}`));

const heading = computed(() => {
    const noun = props.resource;
    switch (props.kind) {
        case LoadErrorKind.NO_ACCESS: return `You do not have access to this ${noun}`;
        case LoadErrorKind.SIGN_IN: return `Sign in to open this ${noun}`;
        case LoadErrorKind.INVALID_LINK: return 'This link is not valid';
        default: return `${noun.charAt(0).toUpperCase()}${noun.slice(1)} not found`;
    }
});

// Why a missing thing is missing, by what it is
const NOT_FOUND_TEXT = {
    organization: 'Check the address, or pick the organization in Organizations.',
    dataset: 'It may have been renamed or deleted.',
    file: 'The file, or its dataset, may have been moved, renamed or deleted.',
    view: 'It may have been deleted.',
    page: 'Check the address.'
};

const text = computed(() => {
    if (props.message) return props.message;
    switch (props.kind) {
        case LoadErrorKind.NO_ACCESS:
            return `${quoted.value} is private. Ask its owner for access, or sign in as another user.`;
        case LoadErrorKind.SIGN_IN:
            return `${quoted.value} is not public. Sign in to open it: you come back here afterwards.`;
        case LoadErrorKind.INVALID_LINK:
            return 'The address cannot be read. Check that the link was copied whole.';
        default:
            return `${quoted.value} does not exist. ${NOT_FOUND_TEXT[props.resource] ?? NOT_FOUND_TEXT.page}`;
    }
});

const icon = computed(() => ({
    [LoadErrorKind.NO_ACCESS]: 'fa-solid fa-lock',
    [LoadErrorKind.SIGN_IN]: 'fa-solid fa-right-to-bracket',
    [LoadErrorKind.INVALID_LINK]: 'fa-solid fa-link-slash'
})[props.kind] ?? 'fa-solid fa-magnifying-glass');

// The organization of the user's own datasets (one-organization installs: that one)
function myOrganization() {
    if (!signedIn()) return null;
    const single = globalThis.HubOptions?.singleOrganization;
    return single !== undefined ? single : (reg.getUsername?.() || null);
}

const links = computed(() => {
    const list = [];
    const signIn = { to: loginLocation(currentPath()), label: 'Sign in', icon: 'fa-solid fa-right-to-bracket' };
    const back = props.backTo ? { to: props.backTo, label: props.backLabel, icon: 'fa-solid fa-arrow-left' } : null;
    if (!signedIn()) {
        // No session: Organizations needs one (the Registry lists them to users only); Sign in instead
        if (props.kind === LoadErrorKind.SIGN_IN) list.push(signIn);
        if (back) list.push(back);
        if (props.kind !== LoadErrorKind.SIGN_IN) list.push(signIn);
        return list;
    }
    if (back) list.push(back);
    const mine = props.kind === LoadErrorKind.NO_ACCESS ? myOrganization() : null;
    if (mine) list.push({ to: { name: 'Datasets', params: { org: mine } }, label: 'Go to my datasets', icon: 'fa-solid fa-database' });
    list.push({ to: { name: 'Organizations' }, label: 'Go to Organizations', icon: 'fa-solid fa-sitemap' });
    return list;
});

// No access with a session: another account may have it (not in a frame, which has no session cookie)
const signedInHere = computed(() => props.kind === LoadErrorKind.NO_ACCESS && signedIn() && !embed);

// The router keeps the previous address of this tab in the history state
const canGoBack = computed(() => !embed && !props.backTo && !!window.history.state?.back);

function goBack() {
    window.history.back();
}

/**
 * Signed out first: Login sends a signed-in user straight back here.
 * @param {import('vue-router').Router} router
 */
async function signInAsAnotherUser(router) {
    const back = loginLocation(currentPath());
    useAuthStore().logout();
    await router.push(back).catch(() => { });
}

watch(heading, value => setTitle(value), { immediate: true });
</script>

<style scoped>
.resource-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    /* Content taller than the screen starts at the top, where it can be scrolled to */
    justify-content: safe center;
    gap: var(--ddb-spacing-sm);
    min-height: 0;
    overflow-y: auto;
    padding: var(--ddb-spacing-xl) var(--ddb-spacing-md);
    text-align: center;
    background: var(--ddb-bg);
    color: var(--ddb-text);
}

.resource-state-icon {
    font-size: 2.5rem;
    color: var(--ddb-text-muted);
}

.resource-state h1 {
    margin: 0;
}

.resource-state-text {
    max-width: 36rem;
    margin: 0;
    color: var(--ddb-text-secondary);
    overflow-wrap: anywhere;
}

.resource-state-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--ddb-spacing-sm);
    margin-top: var(--ddb-spacing-md);
}

.resource-state-action {
    display: inline-flex;
    align-items: center;
    gap: var(--ddb-spacing-xs);
    padding: 0.5rem 1rem;
    border: var(--ddb-border-width) solid var(--ddb-border-medium);
    border-radius: var(--ddb-radius-md);
    background: var(--ddb-bg);
    color: var(--ddb-text);
    font: inherit;
    text-decoration: none;
    cursor: pointer;
}

.resource-state-action:hover {
    background: var(--ddb-bg-hover);
}

.resource-state-action.primary {
    border-color: var(--ddb-primary);
    background: var(--ddb-primary);
    color: var(--ddb-text-on-color);
}

.resource-state-action.primary:hover {
    background: var(--ddb-primary-hover);
}

/* The Hub's ring: the --ddb-focus-ring-* set */
.resource-state-action:focus-visible {
    outline: var(--ddb-focus-ring-width) solid var(--ddb-focus-ring-color);
    outline-offset: var(--ddb-focus-ring-offset);
}
</style>
