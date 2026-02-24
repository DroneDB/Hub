/**
 * Mixin for alert dialogs and flash messages.
 * Shared between Map.vue and SingleMap.vue.
 */
export default {
    data() {
        return {
            alertDialogOpen: false,
            alertTitle: '',
            alertMessage: '',
            flashMessage: null,
            flashIcon: 'check circle outline',
            flashColor: 'positive'
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
        showFlash(message, color = 'positive', icon = 'check circle outline') {
            this.flashMessage = message;
            this.flashColor = color;
            this.flashIcon = icon;
        },
        closeFlash() {
            this.flashMessage = null;
        }
    }
};
