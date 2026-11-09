<template>
    <div id="login" class="page-scroll">
        <div class="login-container">
            <div v-if="xAuthInProgress" class="login-loading">
                <ProgressSpinner class="login-spinner" />
            </div>
            <div v-else>
                <h1>Welcome Back</h1>
                <p>Sign in with your credentials</p>
                <!-- Why the app brought the user here (the one-shot notice of FR-XC-13) -->
                <Message v-if="noticeText" severity="info" :closable="false" class="login-notice">{{ noticeText }}</Message>
                <Card>
                    <template #content>
                        <Form ref="formRef" :resolver="resolver" class="login-form" aria-label="Sign in" @submit="submit(signIn, $event)">
                            <template #default="$form">
                                <!-- Why the sign-in failed, inside the card, above the fields (FR-ACC-05) -->
                                <Message v-if="formError" severity="error" :closable="false" role="alert" class="login-error">{{ formError }}</Message>
                                <div class="login-field">
                                    <IconField>
                                        <InputIcon class="fa-solid fa-user" />
                                        <InputText ref="usernameInput" name="username" placeholder="Username" aria-label="Username"
                                                   autocomplete="username" autocorrect="off" autocapitalize="none" fluid
                                                   :readonly="busy" :invalid="!!errorOf($form, 'username')"
                                                   :aria-invalid="errorOf($form, 'username') ? 'true' : undefined"
                                                   :aria-describedby="errorOf($form, 'username') ? 'login-username-error' : undefined" />
                                    </IconField>
                                    <FieldError id="login-username-error" :message="errorOf($form, 'username')" />
                                </div>
                                <div class="login-field">
                                    <IconField>
                                        <InputIcon class="fa-solid fa-key" />
                                        <PasswordInput name="password" input-id="login-password" placeholder="Password" aria-label="Password"
                                                       autocomplete="current-password" :readonly="busy" :invalid="!!errorOf($form, 'password')"
                                                       :describedby="errorOf($form, 'password') ? 'login-password-error' : ''" />
                                    </IconField>
                                    <FieldError id="login-password-error" :message="errorOf($form, 'password')" />
                                </div>
                                <Button type="submit" label="Login" :loading="busy" class="w-100" size="large" />
                            </template>
                        </Form>
                    </template>
                </Card>
                <div v-if="showRegistrationLink" style="margin-top:1rem">If you don't have an account, you can register for free on <a
                    class="d-inline-block py-1" target="_blank" href="https://dronedb.app/register/">dronedb.app</a></div>
            </div>
        </div>
    </div>
</template>

<script>
import Message from 'primevue/message';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Form from '@primevue/forms/form';
import Card from 'primevue/card';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';
import ProgressSpinner from 'primevue/progressspinner';
import reg from '@/libs/api/sharedRegistry';
import { xAuthAvailable, getXAuthToken } from '@/libs/api/xauth';
import PasswordInput from '@/components/PasswordInput.vue';
import FieldError from '@/components/FieldError.vue';
import { createResolver } from '@/libs/forms/resolver';
import { useHubForm } from '@/composables/useHubForm';
import { usernameProblem, loginPasswordProblem } from '@/libs/accountProblems';
import { isBadRequest, isUnauthorized } from '@/libs/ddb/apiError';
import { mapStores } from 'pinia';
import { useAuthStore } from '@/stores/auth';
import { EXPIRED_TEXT, NOTICE_QUERY, Notice, homeLocation, isAppPath, withoutNotice } from '@/libs/authRoutes';

export default {
    name: 'LoginPage',
    components: {
        Message, Button, InputText, Card, IconField, InputIcon, ProgressSpinner, Form, PasswordInput, FieldError
    },
    setup: function () {
        // One form: Enter and the button are one guarded submit (FR-ACC-04), the fields are checked
        // before any request (FR-ACC-05), and the validators are the ones of libs/accountProblems
        const form = useHubForm({
            fields: ['username', 'password'],
            // A refusal of the credentials says one thing, whichever of the two is wrong: an
            // `errors` member of the answer is not shown at a field either
            fieldErrors: false,
            formMessage: e => (isBadRequest(e) || isUnauthorized(e) ? 'Incorrect username or password.' : (e && e.message) || 'Cannot sign in.')
        });
        const resolver = createResolver({ username: usernameProblem, password: loginPasswordProblem });
        return { ...form, resolver };
    },
    data: function () {
        return {
            xAuthInProgress: false
        }
    },
    computed: {
        ...mapStores(useAuthStore),
        showRegistrationLink: function() {
            return HubOptions.showRegistrationLink !== false;
        },
        // The router's query keeps the notice that the shared handler removed from the address:
        // shown on this visit of the page, not after a reload
        noticeText: function () {
            return this.$route.query[NOTICE_QUERY] === Notice.EXPIRED ? EXPIRED_TEXT : '';
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
        if (!this.xAuthInProgress) this.focusUsername();
        if (this.xAuthInProgress) {
            try {
                await this.authStore.login(null, null, getXAuthToken());
                this.redirectAfterLogin();
            } catch (e) {
                console.error(e);
            }
            this.xAuthInProgress = false;
            this.focusUsername();
        }
    },
    methods: {
        // Back to the page that asked for a sign-in (router guard, expired session), else home;
        // a notice is not carried there
        redirectAfterLogin: function () {
            const redirect = this.$route.query.redirect;
            this.$router.replace(isAppPath(redirect) ? withoutNotice(redirect) : homeLocation());
        },
        // The sign-in starts with the focus in Username (FR-ACC-07)
        focusUsername: async function () {
            await this.$nextTick();
            this.$refs.usernameInput?.$el?.focus();
        },
        // The request of the form (useHubForm calls it once, with the checked values); a failure
        // reaches the form's message (the credentials are refused) or a field
        signIn: async function (values) {
            await this.authStore.login(values.username.trim(), values.password);
            this.redirectAfterLogin();
        }
    }
}
</script>

<style scoped>
#login {
    /* The card sits at a quarter of the height on a tall screen, not in a thin strip at the top (FR-NAV-10) */
    min-height: 100%;
    padding-top: clamp(2rem, 18vh, 20rem);
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

    .login-field {
        text-align: left;
    }

    .login-loading {
        display: flex;
        justify-content: center;
        padding: 2rem;
    }

    .login-error {
        text-align: left;
    }

    .login-notice {
        margin-bottom: 1rem;
    }
}
</style>