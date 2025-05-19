<template>
    <div id="login">
        <div class="ui grid stackable">
            <div class="five wide column"></div>
            <div class="six wide column">
                <div v-if="xAuthInProgress">
                    <i class="icon circle notch spin" />
                </div>
                <div v-else>
                    <h2>Welcome Back</h2>
                    <p>Sign in with your credentials</p>
                    <form class="ui large form">
                        <div class="ui segment">
                            <div class="field">
                                <div class="ui left icon input">
                                    <i class="user icon"></i>
                                    <input v-on:keyup.enter="login" v-model="username" autocomplete="off" type="text"
                                        name="username" placeholder="Username" autocorrect="off" autocapitalize="none">
                                </div>
                            </div>
                            <div class="field">
                                <div class="ui left icon input">
                                    <i class="key icon"></i>
                                    <input v-on:keyup.enter="login" v-model="password" type="password" name="password"
                                        placeholder="Password">
                                </div>
                            </div>
                            <div @click="login" :class="{ loading: loggingIn }"
                                class="ui fluid large primary submit button">Login
                            </div>
                        </div>
                    </form>
                    <div style="margin-top:1rem">If you don't have an account, you can register for free on <a
                            target="_blank" href="https://dronedb.app/register/">dronedb.app</a></div>
                </div>
                <Message bindTo="error" />
            </div>
            <div class="five wide column"></div>
        </div>
    </div>
</template>

<script>
import Message from './Message.vue';
import reg from '../libs/sharedRegistry';
import { xAuthAvailable, getXAuthToken } from '../libs/xauth';

export default {
    components: {
        Message
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
    beforeMount: function () {
        if (reg.isLoggedIn()) {
            this.$router.push({
                name: "Organizations",
                params: { org: HubOptions.singleOrganization !== undefined ? HubOptions.singleOrganization : reg.getUsername() }
            });
        } else if (xAuthAvailable()) {
            // Try to log-in using the xAuthToken
            this.xAuthInProgress = true;
        }
    },
    mounted: async function () {
        if (this.xAuthInProgress) {
            try {
                let res = await reg.login(null, null, getXAuthToken());
                this.redirectToPrevRoute();
            } catch (e) {
                console.error(e);
            }
            this.xAuthInProgress = false;
        }
    },
    methods: {
        redirectToPrevRoute: function () {
            let redirectTo = this.$router.history.current.meta.prev.path;

            // Redirect to previous path, unless it's the same as the current login path
            // in which case redirect to home
            if (['/', '/login'].indexOf(redirectTo) !== -1 && reg.getUsername()) {
                this.$router.push({ name: "Organizations" });
                //this.$router.push({name: "Datasets", params: {org: reg.getUsername()}});
            } else {
                this.$router.push({ path: redirectTo });
            }
        },
        login: async function (e) {
            e.preventDefault();
            this.loggingIn = true;
            this.error = "";

            try {
                await reg.login(this.username, this.password);
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
    margin-top: 32px;
    text-align: center;

    .logo {
        width: 64px;
        height: 64px;
    }
}
</style>