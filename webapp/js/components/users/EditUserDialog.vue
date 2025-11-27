<template>
    <Window title="Edit User" id="editUserDialog" @onClose="close" modal maxWidth="70%" fixedSize>

        <div v-if="loading" class="loading">
            <i class="icon circle notch spin" />
        </div>

        <div v-else class="dialog">
            <Message bindTo="error" />
            <div class="ui message positive" v-if="success">
                <p><strong>User updated successfully!</strong></p>
            </div>

            <form v-on:submit.prevent class="ui form" v-bind:class="{ error: !!error }">
                <div class="field">
                    <label>Username</label>
                    <input type="text" v-model="editUser.userName" disabled />
                </div>
                <div class="field" :class="{ error: editUser.email && !isEmailValid() }">
                    <label>Email</label>
                    <input v-on:keydown="clearError()" v-on:keyup.enter="confirmUpdate()" type="email"
                           v-model="editUser.email" placeholder="user@example.com" />
                    <div v-if="editUser.email && !isEmailValid()" class="ui pointing red basic label">
                        Please enter a valid email address
                    </div>
                </div>
                <div class="field">
                    <label>Roles</label>
                    <select multiple="multiple" v-model="editUser.roles" class="ui dropdown" ref="rolesDropdown">
                        <option v-for="role in availableRoles" :key="role" :value="role">
                            {{ role }}
                        </option>
                    </select>
                    <small>Hold CTRL/⌘ to select multiple roles</small>
                </div>
            </form>
            <div class="buttons">
                <button @click="close()" class="ui button" :disabled="updating">
                    Cancel
                </button>
                <button @click="confirmUpdate()" :disabled="updating || !isValid()" :class="{ loading: updating }"
                    class="ui button primary">
                    Update User
                </button>
            </div>
        </div>
    </Window>
</template>

<script>
import Window from '../Window.vue';
import Message from '../Message.vue';
import reg from '../../libs/sharedRegistry';

export default {
    components: {
        Window, Message
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
    mounted: function () {
        // Initialize Semantic UI dropdown
        this.$nextTick(() => {
            if (this.$refs.rolesDropdown) {
                $(this.$refs.rolesDropdown).dropdown({
                    allowAdditions: false,
                    onChange: (value, text, $selectedItem) => {
                        // Handle both array and string values from Semantic UI dropdown
                        if (Array.isArray(value)) {
                            this.editUser.roles = value;
                        } else {
                            this.editUser.roles = value ? value.split(',') : [];
                        }
                    }
                });

                // Set initial values
                $(this.$refs.rolesDropdown).dropdown('set exactly', this.editUser.roles);
            }
        });
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
    text-align: right;
}

.form {
    margin-bottom: 20px;
}
</style>
