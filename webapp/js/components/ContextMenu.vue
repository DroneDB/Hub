<template>
<div class="ui dropdown item" :style="[styleObj, {visibility: open ? 'visible' : 'hidden'}]">
    <div class="menu">
        <template v-for="item in visibleItems">
            <div v-if="item.type === 'separator'" class="divider" />
            <div v-else class="item" @click="handleClick(item)">
                <i v-if="item.icon != null" style="margin-right: 0.5rem" class="icon" v-bind:class="item.icon"></i>
                {{ item.label }}
            </div>
        </template>
    </div>
</div>
</template>

<script>
import Mouse from '../libs/mouse';
import Keyboard from '../libs/keyboard';

let contextMenus = [];

export default {
  components: {
  },
  props: {
      items: {
          type: Array,
          required: true
      }
  },
  data: function(){
      return {
          open: false,
          styleObj: {}
      }
  },

  mounted: function(){
    // Move to top level, otherwise the menu is hidden
    this.$el.parentNode.removeChild(this.$el);
    document.body.appendChild(this.$el);

    this.$parent.$el.addEventListener('contextmenu', this.openContextMenu, false);
    Mouse.on("click", this.closeContextMenu);
    Keyboard.onKeyDown(this.handleKeyDown);

    contextMenus.push(this);
  },

  beforeDestroy: function(){
    this.$parent.$el.removeEventListener('contextmenu', this.openContextMenu);
    Mouse.off("click", this.closeContextMenu);
    Keyboard.offKeyDown(this.handleKeyDown);

    contextMenus = contextMenus.filter(cm => cm !== this);
  },

  computed: {
      visibleItems: function() {
          return this.items.filter(itm => typeof(itm.isVisible) === 'undefined' || itm.isVisible());
      }
  },

  methods: {
      openContextMenu: function(e){
          e.preventDefault();
          e.stopPropagation();

          this.open = true;

          // Close others
          contextMenus.forEach(cm => { if (cm !== this) cm.closeContextMenu() });

          let x = e.clientX,
              y = e.clientY;
            
          // Check out of window bounds
          const menuHeight = this.$el.children[0].clientHeight,
                menuWidth = this.$el.children[0].clientWidth;
          
          if (menuHeight + y > window.innerHeight) y -= menuHeight;
          if (menuWidth + x > window.innerWidth) x -= menuWidth;

          this.styleObj = {
              top: `${y}px`,
              left: `${x}px`
          };

          window.dispatchEvent(new Event("contextmenuopen"));
      },

      handleKeyDown: function(e){
          if (e.keyCode === 27){ // ESC
              this.open = false;
          }
      },
      
      closeContextMenu: function(e){
          this.open = false;
      },

      handleClick: function(item){
          if (item.click) item.click();
      }
  }
}
</script>

<style scoped>
.ui.dropdown{
    position: absolute;
}
.ui.dropdown > .menu{
    display: block;
}
</style>

    