<template>
    <Window title="Edit User" id="editUserDialog" @onClose="close" modal maxWidth="70%" fixedSize>

        <div v-if="loading" class="loading">
            <i class="fa-solid fa-circle-notch fa-spin" />
        </div>

        <div v-else class="dialog">
            <Message bindTo="error" />
            <PrimeMessage v-if="success" severity="success" :closable="false">
                <strong>User updated successfully!</strong>
            </PrimeMessage>

            <form v-on:submit.prevent class="form" v-bind:class="{ error: !!error }">
                <div class="field">
                    <label>Username</label>
                    <input type="text" v-model="editUser.userName" disabled />
                </div>
                <div class="field" :class="{ error: editUser.email && !isEmailValid() }">
                    <label>Email</label>
                    <input v-on:keydown="clearError()" v-on:keyup.enter="confirmUpdate()" type="email"
                           v-model="editUser.email" placeholder="user@example.com" />
                    <div v-if="editUser.email && !isEmailValid()" class="text-danger small">
                        Please enter a valid email address
                    </div>
                </div>
                <div class="field">
                    <label>Roles</label>
                    <MultiSelect v-model="editUser.roles" :options="roleOptions" optionLabel="label" optionValue="value" placeholder="Select roles" class="w-full" display="chip" />
                </div>
            </form>
            <div class="buttons">
                <Button @click="close()" :disabled="updating" label="Cancel" />
                <Button @click="confirmUpdate()" :disabled="updating || !isValid()" :loading="updating"
                    severity="info" label="Update User" />
            </div>
        </div>
    </Window>
</template>

<script>
import Window from '../Window.vue';
import Message from '../Message.vue';
import MultiSelect from 'primevue/multiselect';
import Button from 'primevue/button';
import PrimeMessage from 'primevue/message';
import reg from '../../libs/sharedRegistry';

export default {
    components: {
        Window, Message, MultiSelect, Button, PrimeMessage
    },
    props: {
        user: {
            type: Object,
            required: true
        },
        availableRoles: {
            type: Array,
            required: true
        }
    },
    emits: ['onClose'],

    data: function () {
        return {
            updating: false,
            success: false,
            loading: false,
            error: "",
            editUser: {
                userName: this.user.userName,
                email: this.user.email || '',
                roles: [...(this.user.roles || [])]
            }
        };
    },
    computed: {
        roleOptions() {
            return this.availableRoles.map(r => ({ label: r, value: r }));
        }
    },
    mounted: function () {
        // PrimeVue MultiSelect handles roles reactively via v-model
    },
    methods: {
        close: function () {
            this.$emit('onClose');
        },
        clearError: function () {
            this.error = "";
        },
        isEmailValid: function () {
            if (!this.editUser.email || this.editUser.email.trim() === "") return true; // Email is optional

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return emailRegex.test(this.editUser.email.trim());
        },
        isValid: function () {
            return this.isEmailValid();
        },
        confirmUpdate: async function () {
            if (!this.isValid()) {
                if (!this.isEmailValid()) {
                    this.error = "Please enter a valid email address";
                    return;
                }
                return;
            }

            this.updating = true;
            try {
                // Update user with both email and roles
                await reg.updateUser(this.editUser.userName, this.editUser.email, this.editUser.roles);

                this.success = true;
                setTimeout(() => {
                    this.updating = false;
                    this.$emit('onClose', 'updated');
                }, 1500);
            } catch (e) {
                this.error = e.message;
                this.updating = false;
            }
        }
    }
}
</script>

<style scoped>
.dialog {
    min-width: 320px;
    padding: 4px;
}

.buttons {
    margin-top: 16px;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
}

.form {
    margin-bottom: 20px;
}
</style>
