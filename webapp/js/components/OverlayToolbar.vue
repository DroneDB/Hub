<template>
    <div class="overlay-toolbar" role="toolbar" :aria-label="label">
        <slot />
    </div>
</template>

<script setup>
/**
 * A toolbar over a dark 3D view: the one look of every bar of a viewer (the measuring tools, the display of a point
 * cloud), so the bars of a view have the same surface, the same button and the same spacing. What stands in it takes
 * its look from its markup:
 *
 *   button                  a tool: a square icon button; one with a `.tool-label` (its name, beside its icon or alone) is as wide as it
 *   button.active           the tool in use; with `.danger`, a tool in use that deletes
 *   button.primary          the action of the bar that saves
 *   .tool-group             tools that belong together: a divider before them
 *   .tool-choice            a choice: a `select.tool-select`, with its name (`label.tool-label`) before it or none, that looks like a tool
 *   .tool-hint              a line of its own under the tools: how to use the one in use, with its `button.hint-action`s
 *
 * An item of a menu opened from the bar (`role="menuitem"`) keeps the look of its menu.
 */
defineProps({
    /** The accessible name of the toolbar */
    label: { type: String, required: true }
});
</script>

<style scoped lang="scss">
@use '../../css/overlay-button' as *;

$tool: 'button:not([role="menuitem"], .hint-action)';

.overlay-toolbar {
    @include overlay-surface;

    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem;
    pointer-events: auto;
}

.overlay-toolbar :deep(#{$tool}) {
    @include toolbar-button;
}

// A tool with its name: as wide as the name, the icon before it
.overlay-toolbar :deep(#{$tool}:has(.tool-label)) {
    width: auto;
    padding: 0 0.6rem;
    gap: 0.4rem;
    white-space: nowrap;
}

.overlay-toolbar :deep(.tool-label) {
    font-size: var(--ddb-font-size-sm, 0.8rem);
}

// The action that saves: the one filled button of the bar
.overlay-toolbar :deep(#{$tool}.primary) {
    background: var(--ddb-viewer-btn-primary);
    font-weight: 600;

    &:hover:not(:disabled):not(.active) {
        background: var(--ddb-viewer-btn-primary-hover);
    }
}

// A tool that deletes what is clicked says so while it is on
.overlay-toolbar :deep(#{$tool}.danger.active) {
    background: var(--ddb-viewer-btn-danger);
}

.overlay-toolbar :deep(.tool-group) {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding-left: 0.25rem;
    border-left: var(--ddb-border-width) solid rgba(var(--ddb-glass-rgb), 0.25);
}

// After every tool, wherever its own tool stands in the bar
.overlay-toolbar :deep(.tool-hint) {
    order: 1;
    flex-basis: 100%;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.4rem;
    padding: 0.1rem 0.25rem;
    font-size: var(--ddb-font-size-sm, 0.8rem);
}

.overlay-toolbar :deep(.hint-action) {
    @include overlay-text-action;
}

// A choice: the select with its name before it, as one tool with a chevron
.overlay-toolbar :deep(.tool-choice) {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    height: 2.25rem;
    margin: 0;
    padding-left: 0.6rem;
    border-radius: 4px;
    white-space: nowrap;
    cursor: pointer;
    transition: background 0.2s ease;

    &:hover:not(:has(select:disabled)) {
        background: rgba(var(--ddb-glass-rgb), 0.15);
    }

    // The select is off, not one of its options (the "View" that names the choice of the views is)
    &:has(select:disabled) {
        opacity: 0.4;
        cursor: default;
    }

    // The chevron, in the colour of the text
    &::after {
        content: '';
        position: absolute;
        right: 0.65rem;
        top: 50%;
        width: 0.4rem;
        height: 0.4rem;
        margin-top: -0.3rem;
        border: solid currentcolor;
        border-width: 0 1.5px 1.5px 0;
        transform: rotate(45deg);
        opacity: 0.8;
        pointer-events: none;
    }

    .tool-label {
        margin: 0;
        opacity: 0.75;
        cursor: inherit;
    }
}

.overlay-toolbar :deep(.tool-select) {
    appearance: none;
    align-self: stretch;
    max-width: 100%;
    padding: 0 1.6rem 0 0;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: inherit;
    font-size: var(--ddb-font-size-sm, 0.8rem);
    cursor: inherit;

    // The list is drawn by the system: it takes a fill of its own, as the select has none
    option {
        background: var(--ddb-viewer-select-bg);
        color: var(--ddb-text-on-dark);
    }
}
</style>
