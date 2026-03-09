/**
 * Mixin for alert dialogs and toast messages.
 * Shared between Map.vue and SingleMap.vue.
 */
export default {
    data() {
        return {
            alertDialogOpen: false,
            alertTitle: '',
            alertMessage: ''
        };
    },
    methods: {
        showAlert(title, message) {
            this.alertTitle = title;
            this.alertMessage = message;
            this.alertDialogOpen = true;
        },
        handleAlertDialogClose() {
            this.alertDialogOpen = false;
        },
        showFlash(message, color = 'positive', icon = 'fa-regular fa-circle-check') {
            const severityMap = { positive: 'success', negative: 'error', warning: 'warn', info: 'info' };
            this.$toast.add({ severity: severityMap[color] || 'success', summary: message, life: 3000 });
        },
        closeFlash() {
            // No-op: Toast auto-closes
        }
    }
};
