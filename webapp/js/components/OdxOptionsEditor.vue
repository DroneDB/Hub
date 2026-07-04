/**
 * OdxOptionsEditor - NodeODX processing options editor.
 *
 * Displays all available NodeODX options grouped by category (mirroring WebODM's
 * EditPresetDialog). Supports grouped (accordion) and flat views, search filtering,
 * and expand/collapse all. Each option is rendered with type-appropriate controls
 * (checkbox, select, text input) via OdxOptionRow.
 *
 * Props:
 *   availableOptions - Array of option objects from API: {name, type, domain, help, value}
 *   presetOptions    - Array of preset defaults: [{name, value}, ...]
 *   modelValue       - Current user customizations: [{name, value}, ...]
 *
 * Emits:
 *   update:modelValue - When user changes an option value
 */
<template>
    <div class="odm-options-editor">
        <!-- Toolbar -->
        <div class="odm-editor-toolbar">
            <div class="odm-toolbar-left">
                <Button type="button" severity="secondary" text @click="toggleSearch"
                    :icon="showSearch ? 'fa-solid fa-xmark' : 'fa-solid fa-magnifying-glass'"
                    :label="showSearch ? 'Close Search' : 'Search'" class="odm-toolbar-btn" />
                <Button type="button" severity="secondary" text @click="toggleViewMode"
                    :icon="viewMode === 'grouped' ? 'fa-solid fa-list' : 'fa-solid fa-layer-group'"
                    :label="viewMode === 'grouped' ? 'Flat View' : 'Grouped View'" class="odm-toolbar-btn" />
                <Button v-if="viewMode === 'grouped'" type="button" severity="secondary" text @click="expandAll"
                    icon="fa-solid fa-up-right-and-down-left-from-center" label="Expand All" class="odm-toolbar-btn" />
                <Button v-if="viewMode === 'grouped'" type="button" severity="secondary" text @click="collapseAll"
                    icon="fa-solid fa-down-left-and-up-right-to-center" label="Collapse All" class="odm-toolbar-btn" />
            </div>
            <div class="odm-toolbar-right">
                <span class="muted" style="font-size: 0.8rem;">{{ changedCount }} changed</span>
            </div>
        </div>

        <!-- Search -->
        <div v-if="showSearch" class="odm-search-bar">
            <InputText v-model="searchQuery" placeholder="Search options by name..." class="w-100" />
        </div>

        <!-- Options content -->
        <div class="odm-options-content" :class="{ 'odm-scroll': true }">
            <!-- Grouped view -->
            <template v-if="viewMode === 'grouped'">
                <div v-for="group in groupsWithContent" :key="group.id" class="odm-option-group">
                    <div class="odm-option-group-header" @click="toggleGroup(group.id)">
                        <i :class="collapsedGroups[group.id] ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-down'"
                            class="odm-toggle-icon" />
                        <i :class="group.icon" class="odm-group-icon" />
                        <span class="odm-group-name">{{ group.name }}</span>
                        <span class="odm-option-count">({{ groupOptionCount(group) }})</span>
                    </div>
                    <div v-show="!collapsedGroups[group.id]" class="odm-option-group-content">
                        <div v-for="subgroup in getSubgroups(group)" :key="subgroup.id" class="odm-option-subgroup">
                            <div v-if="group.subgroups.length > 1" class="odm-option-subgroup-header">
                                {{ subgroup.name }}
                            </div>
                            <div class="odm-option-subgroup-content">
                                <OdxOptionRow v-for="opt in getOptions(group, subgroup)" :key="opt.name"
                                    :option="opt" @update:value="(val) => onOptionChange(opt.name, val)" />
                            </div>
                        </div>
                    </div>
                </div>
                <!-- Ungrouped options -->
                <div v-if="ungroupedOptions.length > 0" class="odm-option-group">
                    <div class="odm-option-group-header" @click="toggleGroup('ungrouped')">
                        <i :class="collapsedGroups['ungrouped'] ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-down'"
                            class="odm-toggle-icon" />
                        <i class="fa-solid fa-circle-question odm-group-icon" />
                        <span class="odm-group-name">Other Options</span>
                        <span class="odm-option-count">({{ ungroupedOptions.length }})</span>
                    </div>
                    <div v-show="!collapsedGroups['ungrouped']" class="odm-option-group-content">
                        <div class="odm-option-subgroup-content">
                            <OdxOptionRow v-for="opt in ungroupedOptions" :key="opt.name" :option="opt"
                                @update:value="(val) => onOptionChange(opt.name, val)" />
                        </div>
                    </div>
                </div>
            </template>

            <!-- Flat view -->
            <template v-else>
                <div class="odm-flat-list">
                    <OdxOptionRow v-for="opt in allMergedOptions" :key="opt.name" :option="opt"
                        @update:value="(val) => onOptionChange(opt.name, val)" />
                </div>
            </template>
        </div>
    </div>
</template>

<script>
import OdxOptionRow from '@/components/OdxOptionRow.vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';

// Option groups (ported from WebODM EditPresetDialog.jsx)
const OPTS_GROUPS = [
    {
        id: 'input', name: 'Input & Preprocessing', icon: 'fa-solid fa-image',
        subgroups: [
            { id: 'camera', name: 'Camera Configuration' },
            { id: 'masks', name: 'Masking' },
            { id: 'multispectral', name: 'Multispectral' },
            { id: 'video', name: 'Video Input' }
        ]
    },
    {
        id: 'boundscrop', name: 'Bounds & Cropping', icon: 'fa-solid fa-crop-simple',
        subgroups: [{ id: 'bounds', name: 'Boundary' }]
    },
    {
        id: 'crs', name: 'Coordinate Reference System', icon: 'fa-solid fa-globe',
        subgroups: [{ id: 'crs-opts', name: 'Options' }]
    },
    {
        id: 'sfm', name: 'Structure From Motion', icon: 'fa-solid fa-camera',
        subgroups: [
            { id: 'feature-extraction', name: 'Feature Extraction' },
            { id: 'feature-matching', name: 'Feature Matching' },
            { id: 'sparse-reconstruction', name: 'Reconstruction' },
            { id: 'gps', name: 'Georeferencing' }
        ]
    },
    {
        id: 'mvs', name: 'Point Cloud', icon: 'fa-solid fa-braille',
        subgroups: [
            { id: 'generation', name: 'Generation' },
            { id: 'filtering', name: 'Filtering' },
            { id: 'postprocess', name: 'Post-Processing' }
        ]
    },
    {
        id: 'mesh', name: 'Meshing', icon: 'fa-solid fa-cube',
        subgroups: [{ id: 'mesh-gen', name: 'Mesh Generation' }]
    },
    {
        id: 'texturing', name: 'Texturing', icon: 'fa-solid fa-palette',
        subgroups: [{ id: 'texture-opts', name: 'Texture Options' }]
    },
    {
        id: 'dem', name: 'Digital Elevation Models', icon: 'fa-solid fa-chart-area',
        subgroups: [
            { id: 'dem-outputs', name: 'Outputs' },
            { id: 'dem-generation', name: 'Resolution & Sampling' },
            { id: 'smrf', name: 'Ground Classification (SMRF)' }
        ]
    },
    {
        id: 'orthophoto', name: 'Orthophoto', icon: 'fa-solid fa-map',
        subgroups: [{ id: 'ortho-opts', name: 'Orthophoto Options' }]
    },
    {
        id: 'tiles', name: 'Tiles', icon: 'fa-solid fa-th',
        subgroups: [{ id: 'tiles-opts', name: 'Tiles Options' }]
    },
    {
        id: 'system', name: 'System & Pipeline Control', icon: 'fa-solid fa-gears',
        subgroups: [
            { id: 'performance', name: 'Performance' },
            { id: 'pipeline', name: 'Pipeline Control' }
        ]
    },
    {
        id: 'split-merge', name: 'Split/Merge', icon: 'fa-solid fa-sitemap',
        subgroups: [
            { id: 'splitting', name: 'Splitting' },
            { id: 'merging', name: 'Merging' }
        ]
    }
];

// Map each option name to its group/subgroup (ported from WebODM)
const OPTION_GROUP_MAP = {
    // Input & Preprocessing
    'camera-lens': { group: 'input', subgroup: 'camera' },
    'cameras': { group: 'input', subgroup: 'camera' },
    'use-fixed-camera-params': { group: 'input', subgroup: 'camera' },
    'rolling-shutter': { group: 'input', subgroup: 'camera' },
    'rolling-shutter-readout': { group: 'input', subgroup: 'camera' },
    'ignore-gsd': { group: 'input', subgroup: 'camera' },
    'bg-removal': { group: 'input', subgroup: 'masks' },
    'sky-removal': { group: 'input', subgroup: 'masks' },
    'primary-band': { group: 'input', subgroup: 'multispectral' },
    'radiometric-calibration': { group: 'input', subgroup: 'multispectral' },
    'skip-band-alignment': { group: 'input', subgroup: 'multispectral' },
    'video-limit': { group: 'input', subgroup: 'video' },
    'video-resolution': { group: 'input', subgroup: 'video' },
    // CRS
    'crs': { group: 'crs', subgroup: 'crs-opts' },
    'report-units': { group: 'crs', subgroup: 'crs-opts' },
    // Split/Merge
    'split': { group: 'split-merge', subgroup: 'splitting' },
    'split-overlap': { group: 'split-merge', subgroup: 'splitting' },
    'sm-cluster': { group: 'split-merge', subgroup: 'splitting' },
    'merge': { group: 'split-merge', subgroup: 'merging' },
    'merge-skip-blending': { group: 'split-merge', subgroup: 'merging' },
    'sm-no-align': { group: 'split-merge', subgroup: 'merging' },
    // Structure from Motion
    'feature-type': { group: 'sfm', subgroup: 'feature-extraction' },
    'feature-quality': { group: 'sfm', subgroup: 'feature-extraction' },
    'min-num-features': { group: 'sfm', subgroup: 'feature-extraction' },
    'matcher-type': { group: 'sfm', subgroup: 'feature-matching' },
    'matcher-neighbors': { group: 'sfm', subgroup: 'feature-matching' },
    'matcher-order': { group: 'sfm', subgroup: 'feature-matching' },
    'sfm-algorithm': { group: 'sfm', subgroup: 'sparse-reconstruction' },
    'sfm-no-partial': { group: 'sfm', subgroup: 'sparse-reconstruction' },
    'use-hybrid-bundle-adjustment': { group: 'sfm', subgroup: 'sparse-reconstruction' },
    'min-track-length': { group: 'sfm', subgroup: 'sparse-reconstruction' },
    'force-gps': { group: 'sfm', subgroup: 'gps' },
    'gps-accuracy': { group: 'sfm', subgroup: 'gps' },
    'gps-z-offset': { group: 'sfm', subgroup: 'gps' },
    'use-exif': { group: 'sfm', subgroup: 'gps' },
    // Dense / MVS
    'pc-quality': { group: 'mvs', subgroup: 'generation' },
    'pc-tile': { group: 'mvs', subgroup: 'generation' },
    'depthmap-min-consistent-views': { group: 'mvs', subgroup: 'generation' },
    'pc-filter': { group: 'mvs', subgroup: 'filtering' },
    'pc-skip-geometric': { group: 'mvs', subgroup: 'filtering' },
    'pc-sample': { group: 'mvs', subgroup: 'filtering' },
    'pc-classify': { group: 'mvs', subgroup: 'postprocess' },
    'pc-rectify': { group: 'mvs', subgroup: 'postprocess' },
    // Meshing
    'skip-3dmodel': { group: 'mesh', subgroup: 'mesh-gen' },
    'mesh-octree-depth': { group: 'mesh', subgroup: 'mesh-gen' },
    'mesh-size': { group: 'mesh', subgroup: 'mesh-gen' },
    // Texturing
    'texturing-single-material': { group: 'texturing', subgroup: 'texture-opts' },
    'texturing-keep-unseen-faces': { group: 'texturing', subgroup: 'texture-opts' },
    'texturing-skip-global-seam-leveling': { group: 'texturing', subgroup: 'texture-opts' },
    'texturing-data-term': { group: 'texturing', subgroup: 'texture-opts' },
    'texturing-regularization': { group: 'texturing', subgroup: 'texture-opts' },
    // Bounds/cropping
    'auto-boundary': { group: 'boundscrop', subgroup: 'bounds' },
    'auto-boundary-distance': { group: 'boundscrop', subgroup: 'bounds' },
    'boundary': { group: 'boundscrop', subgroup: 'bounds' },
    'crop': { group: 'boundscrop', subgroup: 'bounds' },
    // Digital Elevation Models
    'dsm': { group: 'dem', subgroup: 'dem-outputs' },
    'dtm': { group: 'dem', subgroup: 'dem-outputs' },
    'dem-euclidean-map': { group: 'dem', subgroup: 'dem-outputs' },
    'dem-resolution': { group: 'dem', subgroup: 'dem-generation' },
    'dem-decimation': { group: 'dem', subgroup: 'dem-generation' },
    'dem-gapfill-steps': { group: 'dem', subgroup: 'dem-generation' },
    'smrf-scalar': { group: 'dem', subgroup: 'smrf' },
    'smrf-slope': { group: 'dem', subgroup: 'smrf' },
    'smrf-threshold': { group: 'dem', subgroup: 'smrf' },
    'smrf-window': { group: 'dem', subgroup: 'smrf' },
    // Orthophoto
    'orthophoto-resolution': { group: 'orthophoto', subgroup: 'ortho-opts' },
    'fast-orthophoto': { group: 'orthophoto', subgroup: 'ortho-opts' },
    'orthophoto-cutline': { group: 'orthophoto', subgroup: 'ortho-opts' },
    'skip-orthophoto': { group: 'orthophoto', subgroup: 'ortho-opts' },
    'use-3dmesh': { group: 'orthophoto', subgroup: 'ortho-opts' },
    // Tiles
    '3d-tiles': { group: 'tiles', subgroup: 'tiles-opts' },
    'tiles': { group: 'tiles', subgroup: 'tiles-opts' },
    // System & Pipeline Control
    'max-concurrency': { group: 'system', subgroup: 'performance' },
    'no-gpu': { group: 'system', subgroup: 'performance' },
    'optimize-disk-space': { group: 'system', subgroup: 'performance' },
    'skip-report': { group: 'system', subgroup: 'performance' },
    'rerun-from': { group: 'system', subgroup: 'pipeline' },
    'end-with': { group: 'system', subgroup: 'pipeline' }
};

export default {
    name: 'OdxOptionsEditor',

    components: { OdxOptionRow, Button, InputText },

    props: {
        availableOptions: { type: Array, required: true },
        presetOptions: { type: Array, default: () => [] },
        modelValue: { type: Array, default: () => [] }
    },

    emits: ['update:modelValue'],

    data() {
        // Initialize collapsed groups
        const collapsedGroups = { ungrouped: true };
        OPTS_GROUPS.forEach(g => { collapsedGroups[g.id] = true; });

        return {
            collapsedGroups,
            searchQuery: '',
            showSearch: false,
            viewMode: 'grouped'
        };
    },

    computed: {
        // Merge available options with preset defaults and user customizations
        allMergedOptions() {
            const result = this.availableOptions.map(opt => {
                const merged = { ...opt };
                // Set defaultValue from node's default value
                merged.defaultValue = merged.value !== undefined ? merged.value : '';
                // Apply preset override
                const presetOpt = this.presetOptions.find(p => p.name === opt.name);
                if (presetOpt) {
                    merged.value = presetOpt.value;
                } else {
                    merged.value = merged.defaultValue;
                }
                // Apply user customization
                const userOpt = this.modelValue.find(p => p.name === opt.name);
                if (userOpt) {
                    merged.value = userOpt.value;
                }
                // Interpolate help text
                if (typeof merged.help === 'string') {
                    const choices = Array.isArray(merged.domain)
                        ? merged.domain.join(', ')
                        : (merged.domain || '');
                    merged.help = merged.help
                        .replace(/\{choices\}/g, choices)
                        .replace(/\{default\}/g, merged.defaultValue ?? '');
                }
                return merged;
            });
            // Sort by name
            result.sort((a, b) => a.name.localeCompare(b.name));
            return result;
        },

        // Build lookup by name
        optionsLookup() {
            const lookup = {};
            this.allMergedOptions.forEach(opt => { lookup[opt.name] = opt; });
            return lookup;
        },

        // Filtered options (search)
        filteredOptions() {
            if (!this.searchQuery) return this.allMergedOptions;
            const q = this.searchQuery.toLowerCase();
            return this.allMergedOptions.filter(opt => opt.name.toLowerCase().includes(q));
        },

        // Groups that have content
        groupsWithContent() {
            const assignedNames = new Set();
            const groups = OPTS_GROUPS.map(group => {
                const subgroups = group.subgroups.map(subgroup => {
                    const options = Object.keys(OPTION_GROUP_MAP)
                        .filter(optName => {
                            const mapping = OPTION_GROUP_MAP[optName];
                            return mapping.group === group.id && mapping.subgroup === subgroup.id;
                        })
                        .filter(optName => this.optionsLookup[optName])
                        .filter(optName => {
                            const opt = this.optionsLookup[optName];
                            return !this.searchQuery || opt.name.toLowerCase().includes(this.searchQuery.toLowerCase());
                        })
                        .map(optName => {
                            assignedNames.add(optName);
                            return this.optionsLookup[optName];
                        });
                    return { ...subgroup, options };
                }).filter(sg => sg.options.length > 0);

                return { ...group, subgroups };
            }).filter(g => g.subgroups.length > 0);

            return groups;
        },

        // Options not in any group
        ungroupedOptions() {
            const assignedNames = new Set();
            this.groupsWithContent.forEach(group => {
                group.subgroups.forEach(sg => {
                    sg.options.forEach(opt => assignedNames.add(opt.name));
                });
            });
            return this.filteredOptions.filter(opt => !assignedNames.has(opt.name));
        },

        // Count of changed options
        changedCount() {
            return this.modelValue.length;
        }
    },

    methods: {
        toggleGroup(groupId) {
            this.collapsedGroups[groupId] = !this.collapsedGroups[groupId];
        },
        expandAll() {
            OPTS_GROUPS.forEach(g => { this.collapsedGroups[g.id] = false; });
            this.collapsedGroups['ungrouped'] = false;
        },
        collapseAll() {
            OPTS_GROUPS.forEach(g => { this.collapsedGroups[g.id] = true; });
            this.collapsedGroups['ungrouped'] = true;
        },
        toggleSearch() {
            this.showSearch = !this.showSearch;
            if (!this.showSearch) this.searchQuery = '';
        },
        toggleViewMode() {
            this.viewMode = this.viewMode === 'grouped' ? 'flat' : 'grouped';
        },
        groupOptionCount(group) {
            let count = 0;
            group.subgroups.forEach(sg => { count += sg.options.length; });
            return count;
        },
        getSubgroups(group) {
            return group.subgroups.filter(sg => sg.options.length > 0);
        },
        getOptions(group, subgroup) {
            return subgroup.options;
        },
        onOptionChange(name, value) {
            let customizations = [...this.modelValue];
            const idx = customizations.findIndex(o => o.name === name);

            if (value === '' || value === undefined || value === null) {
                // Reset: remove from customizations
                if (idx >= 0) customizations.splice(idx, 1);
            } else {
                if (idx >= 0) {
                    customizations[idx] = { name, value };
                } else {
                    customizations.push({ name, value });
                }
            }

            this.$emit('update:modelValue', customizations);
        }
    }
};
</script>

<style scoped>
.odm-options-editor {
    border: 1px solid var(--ddb-border, #dee2e6);
    border-radius: 6px;
    background: var(--ddb-bg-secondary, #f8f9fa);
}

.odm-editor-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--ddb-border, #dee2e6);
    background: var(--ddb-bg-primary, #fff);
    border-radius: 6px 6px 0 0;
}

.odm-toolbar-left {
    display: flex;
    gap: 0.25rem;
    flex-wrap: wrap;
}

.odm-toolbar-btn {
    padding: 0.2rem 0.5rem;
    font-size: 0.78rem;
}

.odm-toolbar-right {
    flex-shrink: 0;
    margin-left: 0.5rem;
}

.odm-search-bar {
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--ddb-border, #dee2e6);
}

.odm-options-content {
    max-height: 28rem;
    overflow-y: auto;
}

.odm-option-group {
    border-bottom: 1px solid var(--ddb-border, #dee2e6);
}

.odm-option-group-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    cursor: pointer;
    background: var(--ddb-bg-primary, #fff);
    font-weight: 600;
    font-size: 0.85rem;
    user-select: none;
}

.odm-option-group-header:hover {
    background: var(--ddb-bg-hover, #e9ecef);
}

.odm-toggle-icon {
    font-size: 0.7rem;
    color: var(--ddb-text-muted, #888);
}

.odm-group-icon {
    font-size: 0.9rem;
    color: var(--ddb-primary, #0d6efd);
}

.odm-group-name {
    flex: 1;
}

.odm-option-count {
    color: var(--ddb-text-muted, #888);
    font-weight: 400;
    font-size: 0.8rem;
}

.odm-option-group-content {
    padding: 0 0.75rem 0.5rem 1.5rem;
}

.odm-option-subgroup-header {
    font-weight: 600;
    font-size: 0.8rem;
    color: var(--ddb-text-muted, #6c757d);
    padding: 0.3rem 0;
    border-bottom: 1px solid var(--ddb-border, #dee2e6);
    margin-bottom: 0.25rem;
}

.odm-option-subgroup-content {
    padding: 0.25rem 0;
}

.odm-flat-list {
    padding: 0.5rem 0.75rem;
}

.muted {
    color: var(--ddb-text-muted, #888);
}
</style>
