<template>
    <div id="account">
        <Message bindTo="error" />

        <div v-if="loading" class="loading">
            <i class="icon circle notch spin" />
        </div>
        <div v-else>
            <div class="top ui equal width grid middle aligned">
                <div class="column">
                    <h1>Account</h1>
                </div>
            </div>
            <div class="ui segments account">
                <div class="ui segment" @click="handleChangePwd">
                    <div class="ui two column grid">
                        <div class="two column row">
                            <div class="thirteen wide column main"><i class="lock icon"></i>Security</div>
                            <div class="three wide column right aligned">
                                <button @click.stop="handleChangePwd" class="ui button icon small primary"
                                    :class="{ loading }" :disabled="loading">
                                    <i class="ui icon pencil"></i> Change Password
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <ChangePwdDialog @onClose="showChangePwd = false" v-if="showChangePwd" />
    </div>
</template>

<script>
import Message from '../Message.vue';
import ChangePwdDialog from './ChangePwdDialog.vue';
import ddb from 'ddb';

const { Registry } = ddb;
const reg = new Registry(window.location.origin);

export default {
    components: {
        Message, ChangePwdDialog
    },
    data: function () {
        return {
            error: "",
            loading: false,

            showChangePwd: false
        }
    },
    mounted: async function () {

    },
    methods: {
        handleChangePwd() {
            this.showChangePwd = true;
        }
    }
}
</script>

<style scoped>
#account {
    margin: 12px;
    margin-top: 36px;

    .top {
        margin-bottom: 12px;
    }

    .account {
        .segment {
            &:hover {
                background-color: #f5f5f5;
                cursor: pointer;
            }
        }

        .column {
            font-size: large;

            .main {
                font-weight: bold;
                margin-top: 6px;

                i.icon {
                    margin-right: 20px;
                }
            }
        }
    }
}
</style>
