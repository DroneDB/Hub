<template>
    <div v-if="parentRef[bindTo]" class="ui message" :class="className">
        <i class="close icon" @click="dismiss"></i>
        <span v-html="parentRef[bindTo]" />
    </div>
</template>

<script>
export default {
  props: {
      bindTo: {
          type: String,
          default: "message"
      },
      className: {
          type: String,
          default: "warning"
      }
  },
  data: function(){
      return {
          parentRef: {}
      }
  },
  beforeMount: function(){
    // Traverse the Vue component tree until we find 
    // a component with the bind property we need
    let p = this.$parent;
    while(p !== undefined && p[this.bindTo] === undefined){
        p = p.$parent;
    }
    this.parentRef = p;
  },
  methods: {
      dismiss: function(){
          this.parentRef[this.bindTo] = "";
      }
  }
}
</script>

<style scoped>
</style>