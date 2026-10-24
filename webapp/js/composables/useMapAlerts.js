// @ts-check
/**
 * Alerts and short notices of the map viewers (HQ-07: a composable; was the
 * useMapAlertFlash mixin, and Potree had a copy of `showFlash`).
 *
 *   const { alertDialogOpen, alertTitle, alertMessage, showAlert, handleAlertDialogClose, showFlash } = useMapAlerts();
 */
import { ref } from 'vue';
import { notify } from '@/libs/notify';

const SEVERITY = { positive: 'success', negative: 'error', warning: 'warn', info: 'info' };

/**
 * A short notice (toast summary only); `color` is the legacy name of the severity.
 * @param {string} message
 * @param {'positive'|'negative'|'warning'|'info'} [color]
 */
export function flash(message, color = 'positive') {
    notify[SEVERITY[color] || 'success']({ summary: message });
}

export function useMapAlerts() {
    const alertDialogOpen = ref(false);
    const alertTitle = ref('');
    const alertMessage = ref('');

    /** A message the user must acknowledge (MapDialogs). @param {string} title @param {string} message */
    function showAlert(title, message) {
        alertTitle.value = title;
        alertMessage.value = message;
        alertDialogOpen.value = true;
    }

    return {
        alertDialogOpen, alertTitle, alertMessage, showAlert,
        handleAlertDialogClose: () => { alertDialogOpen.value = false; },
        showFlash: flash
    };
}
