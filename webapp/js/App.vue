<template>
<div id="app">
    <Header @login="handleLogin" @logout="handleLogout" />
    <div id="views" ref="views">
    </div>
</div>
</template>

<script>


export default {
  components: {
      Header
  },
  mounted: function(){
        
  },
  destroyed: function(){
  },
  methods: {
      handleLogout: function(){
          reg.logout();
          this.handleLogin();
      },

      handleLogin: function(){
          this.router.push({name: "Login"}).catch(()=>{});
      }
  }
}
</script>

<style scoped>
</style>