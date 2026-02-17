<template>
</template>

<script>
import { rootPath } from '../dynamic/pathutils';
import { Control } from 'ol/control';

/**
 * Map settings control — a single button that opens the MapSettingsDialog.
 */
class SettingsControl extends Control {
    /**
     * @param {Object} [opt_options] Control options.
     * @param {Function} opt_options.onOpenSettings - Called when the settings button is clicked.
     */
    constructor(opt_options) {
        const options = opt_options || {};

        const btn = document.createElement('button');
        btn.title = 'Map Settings — Change basemap, units, and display options.';
        btn.innerHTML = '<img src="' + rootPath("/images/settings.svg") + '"/>';

        const element = document.createElement('div');
        element.className = 'ol-settings ol-unselectable ol-control';
        element.appendChild(btn);

        super({
            element: element,
            target: options.target,
        });

        this.onOpenSettings = options.onOpenSettings || (() => {});

        btn.addEventListener('click', () => {
            this.onOpenSettings();
        });
    }
}

export default { Control: SettingsControl };
</script>
