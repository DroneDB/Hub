<template>
    <div id="login" class="page-scroll">
        <div class="login-container">
            <div v-if="xAuthInProgress" class="login-loading">
                <ProgressSpinner class="login-spinner" />
            </div>
            <div v-else>
                <h2>Welcome Back</h2>
                <p>Sign in with your credentials</p>
                <Card>
                    <template #content>
                        <div class="login-form">
                            <IconField>
                                <InputIcon class="fa-solid fa-user" />
                                <InputText v-model="username" placeholder="Username" aria-label="Username" autocomplete="off"
                                           autocorrect="off" autocapitalize="none" fluid @keyup.enter="login" />
                            </IconField>
                            <IconField>
                                <InputIcon class="fa-solid fa-key" />
                                <Password v-model="password" placeholder="Password" aria-label="Password" :feedback="false"
                                          toggle-mask fluid input-class="w-100" @keyup.enter="login" />
                            </IconField>
                            <Button label="Login" :loading="loggingIn" class="w-100" size="large" @click="login" />
                        </div>
                    </template>
                </Card>
                <div v-if="showRegistrationLink" style="margin-top:1rem">If you don't have an account, you can register for free on <a
                    class="d-inline-block py-1" target="_blank" href="https://dronedb.app/register/">dronedb.app</a></div>
            </div>
            <Message v-if="error" severity="error" :closable="false" class="login-error">{{ error }}</Message>
        </div>
    </div>
</template>

<script>
import Message from 'primevue/message';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Password from 'primevue/password';
import Card from 'primevue/card';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';
import ProgressSpinner from 'primevue/progressspinner';
import reg from '@/libs/api/sharedRegistry';
import { xAuthAvailable, getXAuthToken } from '@/libs/api/xauth';
import { mapStores } from 'pinia';
import { useAuthStore } from '@/stores/auth';
import { isAppPath } from '@/libs/authRoutes';

export default {
    name: 'LoginPage',
    components: {
        Message, Button, InputText, Password, Card, IconField, InputIcon, ProgressSpinner
    },
    data: function () {
        return {
            error: "",

            loggingIn: false,
            xAuthInProgress: false,
            username: "",
            password: ""
        }
    },
    computed: {
        ...mapStores(useAuthStore),
        showRegistrationLink: function() {
            return HubOptions.showRegistrationLink !== false;
        }
    },
    beforeMount: function () {
        if (reg.ensureLoggedIn()) {
            this.redirectAfterLogin();
        } else if (xAuthAvailable()) {
            this.xAuthInProgress = true;
        }
    },
    mounted: async function () {
        if (this.xAuthInProgress) {
            try {
                await this.authStore.login(null, null, getXAuthToken());
                this.redirectAfterLogin();
            } catch (e) {
                console.error(e);
            }
            this.xAuthInProgress = false;
        }
    },
    methods: {
        // Back to the page that asked for a sign-in (router guard, expired session), else home
        redirectAfterLogin: function () {
            const redirect = this.$route.query.redirect;
            this.$router.replace(isAppPath(redirect) ? redirect : { name: "Organizations" });
        },
        login: async function (e) {
            if (e && e.preventDefault) e.preventDefault();
            this.loggingIn = true;
            this.error = "";

            try {
                await this.authStore.login(this.username, this.password);
                this.redirectAfterLogin();
            } catch (e) {
                this.error = e.message;
            }

            this.loggingIn = false;
        }
    }
}
</script>

<style scoped>
#login {
    padding-top: 2rem;
    text-align: center;
    display: flex;
    justify-content: center;

    .login-container {
        width: 100%;
        max-width: var(--ddb-login-max-width);
        padding: 0 var(--ddb-spacing-lg);
    }

    .login-spinner {
        width: 3rem;
        height: 3rem;
    }

    .login-form {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .login-loading {
        display: flex;
        justify-content: center;
        padding: 2rem;
    }

    .login-error {
        margin-top: 1rem;
    }
}
</style>