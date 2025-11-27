<template>
    <Window title="Add User" id="addUserDialog" @onClose="close" modal maxWidth="70%" fixedSize>

        <div v-if="loading" class="loading">
            <i class="icon circle notch spin" />
        </div>

        <div v-else class="dialog">
            <Message bindTo="error" />
            <div class="ui message positive" v-if="success">
                <p><strong>User added successfully!</strong></p>
            </div>

            <form v-on:submit.prevent class="ui form" v-bind:class="{ error: !!error }">
                <div class="field">
                    <label>Username</label>
                    <input ref="txtUsername" v-on:keydown="clearError()" v-on:keyup.enter="confirmAddUser()" type="text"
                        v-model="username" placeholder="" />
                </div>
                <div class="field" :class="{ error: email && !isEmailValid() }">
                    <label>Email</label>
                    <input v-on:keydown="clearError()" v-on:keyup.enter="confirmAddUser()" type="email"
                        v-model="email" placeholder="user@example.com" />
                    <div v-if="email && !isEmailValid()" class="ui pointing red basic label">
                        Please enter a valid email address
                    </div>
                </div>
                <div class="field">
                    <label>Password</label>
                    <input v-on:keydown="clearError()" v-on:keyup.enter="confirmAddUser()" type="password"
                        v-model="password" placeholder="" />
                </div>
                <div class="field">
                    <label>Roles</label>
                    <select multiple="multiple" v-model="roles" class="ui dropdown" ref="rolesDropdown">
                        <option v-for="role in availableRoles" :key="role" :value="role">
                            {{ role }}
                        </option>
                    </select>
                    <small>Hold CTRL/⌘ to select multiple roles</small>
                </div>
            </form>
            <div class="buttons">
                <button @click="close()" class="ui button" :disabled="adding">
                    Close
                </button>
                <button @click="confirmAddUser()" :disabled="adding || !isFilled()" :class="{ loading: adding }"
                    class="ui button primary">
                    Add User
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
        availableRoles: {
            type: Array,
            required: true
        }
    },

    data: function () {
        return {
            adding: false,
            success: false,
            loading: false,
            error: "",
            username: "",
            email: "",
            password: "",
            roles: []
        };
    },
    mounted: function () {
        this.$nextTick(() => {
            this.$refs.txtUsername.focus();

            // Initialize Semantic UI dropdown
            if (this.$refs.rolesDropdown) {
                $(this.$refs.rolesDropdown).dropdown({
                    allowAdditions: false,
                    onChange: (value, text, $selectedItem) => {
                        this.roles = value ? value.split(',') : [];
                    }
                });
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
        isFilled: function () {
            return this.username !== "" && this.password !== "" && this.isEmailValid();
        },
        isEmailValid: function () {
            if (!this.email || this.email.trim() === "") return true; // Email is optional

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return emailRegex.test(this.email.trim());
        },
        confirmAddUser: async function () {
            if (!this.isFilled()) {
                if (!this.isEmailValid()) {
                    this.error = "Please enter a valid email address";
                    return;
                }
                return;
            }

            this.adding = true;
            try {
                const user = await reg.addUser(this.username, this.password, this.roles, this.email);
                this.success = true;
                setTimeout(() => {
                    this.adding = false;
                    this.$emit('onClose', user);
                }, 2500);
            } catch (e) {
                this.error = e.message;
                this.adding = false;
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