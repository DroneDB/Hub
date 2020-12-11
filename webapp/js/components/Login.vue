<template>
<div id="login">
    <div class="ui grid stackable">
        <div class="five wide column"></div>
        <div class="six wide column">
            <h2>Welcome Back</h2>
            <p>Sign in with your credentials</p>
            <form class="ui large form">
                <div class="ui segment">
                    <div class="field">
                        <div class="ui left icon input">
                            <i class="user icon"></i>
                            <input v-on:keyup.enter="login" v-model="username" autocomplete="off" type="text" name="username" 
                                    placeholder="Username" autocorrect="off" autocapitalize="none">
                        </div>
                    </div>
                    <div class="field">
                        <div class="ui left icon input">
                            <i class="key icon"></i>
                            <input v-on:keyup.enter="login" v-model="password" type="password" name="password" placeholder="Password">
                        </div>
                    </div>
                    <div @click="login" :class="{loading: loggingIn}" class="ui fluid large primary submit button">Login</div>
                </div>
            </form>
            <Message bindTo="error" />
        </div>
        <div class="five wide column"></div>
    </div>
</div>
</template>

<script>
import Message from 'commonui/components/Message.vue';
import reg from '../libs/sharedRegistry';

export default {
  components: {
      Message
  },
  data: function(){
      return {
          error: "",

          loggingIn: false,
          username: "",
          password: ""
      }
  },
  beforeMount: function(){
      if (reg.isLoggedIn()){
          this.$router.push({name: "UserHome", params: {org: reg.getUsername()}});
      }
  },
  methods: {
      login: async function(e){
        e.preventDefault();
        this.loggingIn = true;
        this.error = "";
        
        try{
            await reg.login(this.username, this.password);
            this.$router.push({name: "UserHome", params: {org: reg.getUsername()}});
        }catch(e){
            this.error = e.message;
        }

        this.loggingIn = false;
      }
  }
}
</script>

<style scoped>
#login{
    margin-top: 32px;
    text-align: center;
    .logo{
        width: 64px;
        height: 64px;
    }
}
</style>