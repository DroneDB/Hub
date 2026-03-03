<template>
    <div id="login">
        <div class="login-container">
            <div v-if="xAuthInProgress" class="login-loading">
                <ProgressSpinner style="width: 50px; height: 50px" />
            </div>
            <div v-else>
                <h2>Welcome Back</h2>
                <p>Sign in with your credentials</p>
                <Card>
                    <template #content>
                        <div class="login-form">
                            <IconField>
                                <InputIcon class="fa-solid fa-user" />
                                <InputText v-model="username" placeholder="Username" autocomplete="off"
                                    autocorrect="off" autocapitalize="none" @keyup.enter="login" fluid />
                            </IconField>
                            <IconField>
                                <InputIcon class="fa-solid fa-key" />
                                <Password v-model="password" placeholder="Password" :feedback="false"
                                    toggleMask @keyup.enter="login" fluid inputClass="w-100" />
                            </IconField>
                            <Button label="Login" :loading="loggingIn" @click="login" severity="info" class="w-100" size="large" />
                        </div>
                    </template>
                </Card>
                <div v-if="showRegistrationLink" style="margin-top:1rem">If you don't have an account, you can register for free on <a
                        target="_blank" href="https://dronedb.app/register/">dronedb.app</a></div>
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
import reg from '../libs/sharedRegistry';
import { xAuthAvailable, getXAuthToken } from '../libs/xauth';

export default {
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
        showRegistrationLink: function() {
            return HubOptions.showRegistrationLink !== false;
        }
    },
    beforeMount: function () {
        if (reg.ensureLoggedIn()) {
            this.$router.push({ name: "Organizations" });
        } else if (xAuthAvailable()) {
            this.xAuthInProgress = true;
        }
    },
    mounted: async function () {
        if (this.xAuthInProgress) {
            try {
                let res = await reg.login(null, null, getXAuthToken());
                await reg.loadFeatures();
                this.redirectToPrevRoute();
            } catch (e) {
                console.error(e);
            }
            this.xAuthInProgress = false;
        }
    },
    methods: {
        redirectToPrevRoute: function () {
            const prev = this.$route.meta.prev;
            let redirectTo = prev ? prev.path : '/';

            if (['/', '/login'].indexOf(redirectTo) !== -1 && reg.getUsername()) {
                this.$router.push({ name: "Organizations" });
            } else {
                this.$router.push({ path: redirectTo });
            }
        },
        login: async function (e) {
            if (e && e.preventDefault) e.preventDefault();
            this.loggingIn = true;
            this.error = "";

            try {
                await reg.login(this.username, this.password);
                await reg.loadFeatures();
                this.redirectToPrevRoute();
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
    margin-top: 2rem;
    text-align: center;
    display: flex;
    justify-content: center;

    .login-container {
        width: 100%;
        max-width: 420px;
        padding: 0 1rem;
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