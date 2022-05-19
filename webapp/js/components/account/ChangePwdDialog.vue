<template>
    <Window title="Change Password" id="changePwdDialog" @onClose="close"
            modal
            maxWidth="70%"
            fixedSize>
        <div class="dialog">
            <form v-on:submit.prevent class="ui form" v-bind:class="{ error: !!error}">
                <div class="ui error message" v-if="error">
                    <p>{{error}}</p>
                </div>
                <div class="ui message positive" v-if="success">
                    <p><strong>Password changed successfully!</strong></p>
                </div>
                <div class="field">
                    <label>Old Password</label>
                    <input ref="oldPwd" v-on:keydown="clearError()" v-on:keyup.enter="changePwd()" type="password" v-model="oldPwd" placeholder="" />
                </div>
                <div class="field">
                    <label>New Password</label>
                    <input v-on:keydown="clearError()" v-on:keyup.enter="changePwd()" type="password" v-model="newPwd" placeholder="" />
                </div>
                <div class="field">
                    <label>Confirm New Password</label>
                    <input v-on:keydown="clearError()" v-on:keyup.enter="changePwd()" type="password" v-model="confirmPwd" placeholder="" />
                </div>
            </form>  
            <div class="buttons">
                <button @click="close()" class="ui button" :disabled="changing">
                    Close
                </button>
                <button @click="changePwd()" :disabled="changing || !isFilled()" :class="{loading: changing}" class="ui button primary">
                    Change Password
                </button>
            </div>
        </div>
    </Window>
</template>

<script>
import Window from '../Window.vue';
import reg from '../../libs/sharedRegistry';

export default {
    components: {
        Window
    },
    props: {
        
    },
  
    data: function(){
        return {
            changing: false,
            success: false,
            error: "",
            oldPwd: "",
            newPwd: "",
            confirmPwd: ""
        };
    },
    mounted: function() {
        this.$nextTick(() => this.$refs.oldPwd.focus());

    },
    methods: {
        close: function(buttonId){
            this.$emit('onClose');
        },
        clearError: function(){
            this.error = "";
        },
        isFilled: function() {
            return this.oldPwd !== "" && this.newPwd !== "" && this.confirmPwd !== "";
        },
        changePwd: async function(){
            if (!this.isFilled()) return;
            if (this.newPwd !== this.confirmPwd){
                this.error = "The new passwords do not match.";
                return;
            }

            this.changing = true;
            try{
                await reg.changePwd(this.oldPwd, this.newPwd);
                this.success = true;
                setTimeout(() => {
                    this.close();
                    this.changing = false;
                }, 2500);
            }catch(e){
                this.error = e.message;
                this.changing = false;
            }
        }
    }
}
</script>

<style scoped>
.dialog{
    min-width: 320px;
    padding: 4px;
}
.buttons{
    margin-top: 16px;
    text-align: right;
}
.form {
    margin-bottom: 20px;
}
</style>