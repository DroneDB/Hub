<template>
<div class="panel">
    <slot />
</div>
</template>

<script>
import Mouse from '../libs/mouse';
import { isMobile, isTablet } from '../libs/responsive';

export default {
  components: {
  },
  props: {
      split: {
          type: String,
          default: "vertical"
      },
      amount: {
          type: String,
          default: "50%"
      },
      mobileAmount: {
          type: String,
          default: ""
      },
      tabletAmount: {
          type: String,
          default: ""
      }
  },
  
  data: function(){
      const size = this.panelSize();

      let data = {
          panel0Style: {
              width: this.split === "vertical" ? size : "100%",
              height: this.split === "horizontal" ? size : "100%",
              zIndex: 0
          },
          panel1Style: {
              width: this.split === "vertical" ? (100 - parseFloat(size)) + "%" : "100%",
              height: this.split === "horizontal" ? (100 - parseFloat(size)) + "%" : "100%",
              zIndex: 1,
              borderTop: this.split === "horizontal" ? "1px solid #030A03" : undefined,
              borderLeft: this.split === "vertical" ? "1px solid #030A03" : undefined,
          },
          resizing: false,
          canResize: false
      };

      return data;
  },
  mounted: function(){
      Mouse.on("mouseup", this.mouseUp);
      Mouse.on("mousedown", this.mouseDown);
      Mouse.on("mousemove", this.mouseMove);

      // Update styles
      this.updateStyle(this.$el.children[0], this.panel0Style);
      this.updateStyle(this.$el.children[1], this.panel1Style);
  },
  beforeDestroy: function(){
      Mouse.off("mouseup", this.mouseUp);
      Mouse.off("mousedown", this.mouseDown);
      Mouse.off("mousemove", this.mouseMove);
  },
  methods: {
      panelSize: function(){
            if (isMobile() && this.mobileAmount) return this.mobileAmount;
            else if (isTablet() && this.tabletAmount) return this.tabletAmount;
            else return this.amount;
      },

      onTabActivated: function(){
        // Propagate
        for (let i = 0; i < this.$children.length; i++){
            const $c = this.$children[i];
            if ($c.onTabActivated !== undefined){
                $c.onTabActivated();
            }
        }
      },
      onPanelResized: function(){
        for (let i = 0; i < this.$children.length; i++){
            const $c = this.$children[i];
            if ($c.onPanelResized !== undefined){
                $c.onPanelResized();
            }
        }
      },
      updateStyle: function(el, style){
        el.style.width = style.width;
        el.style.height = style.height;
        el.style.zIndex = style.zIndex;
        el.style.borderTop = style.borderTop;
        el.style.borderLeft = style.borderLeft;
      },
      mouseDown: function(e){
          if (this.canResize){
            this.resizing = true;

            this.startResize = {
              x: e.clientX,
              y: e.clientY,
              panelWidth: this.$el.children[0].style.width,
              panelHeight: this.$el.children[0].style.height
            };
          }
      },

      mouseUp: function(e){
          if (this.resizing){
            this.onPanelResized();
          }

          this.resizing = false;
          this.canResize = false;
          Mouse.setCursor();
      },

      mouseMove: function(e){
          if (this.resizing){
              const deltaX = e.clientX - this.startResize.x,
                    deltaY = e.clientY - this.startResize.y;
              const w = this.$el.children[0].clientWidth + this.$el.children[1].clientWidth;
              const h = this.$el.children[0].clientHeight + this.$el.children[1].clientHeight;

              let width = parseFloat(this.startResize.panelWidth);
              let height = parseFloat(this.startResize.panelHeight);

              if (this.split === "vertical" && this.canResize){
                  // Modify width from right
                  width += ((deltaX / w) * 100.0);
              }else if (this.split === "horizontal" && this.canResize){
                  // Modify width from right
                  height += ((deltaY / h) * 100.0);
              }

              if (this.split === "vertical" && width < 100.0){
                this.panel0Style.width = width + '%';
                this.panel1Style.width = (100 - width) + '%';
              }else if (this.split === "horizontal" && height < 100.0){
                this.panel0Style.height = height + '%';
                this.panel1Style.height = (100 - height) + '%';
              }
          }else{
            // TODO: does this work with popup windows (check z-index)?
            const left = this.$el.children[0].offsetLeft,
                    right = left + this.$el.children[0].clientWidth,
                    top = this.$el.children[0].offsetTop,
                    bottom = top + this.$el.children[0].clientHeight;
            const MARGIN = 12;

            const resizeVer = Math.abs(right - e.clientX) < MARGIN &&
                              e.clientY >= top && e.clientY <= bottom;
            const resizeHor = Math.abs(bottom - e.clientY) < MARGIN &&
                              e.clientX >= left && e.clientX <= right;

            let cursor = "";

            if (this.split === "vertical" && resizeVer) cursor = "ew-resize";
            if (this.split === "horizontal" && resizeHor) cursor = "ns-resize";

            if (cursor !== ""){
                this.canResize = true;
                Mouse.setCursor(cursor);
            }else{
                this.canResize = false;
                Mouse.clearCursor(this.split === "vertical" ? "ew-resize" : "ns-resize");
            }
          }
      }
    },

    watch: {
        panel0Style: {
            deep: true,
            handler: function (val) {
                this.updateStyle(this.$el.children[0], val);
            }
        },
        panel1Style: {
            deep: true,
            handler: function (val) {
                this.updateStyle(this.$el.children[1], val);
            }
        }
    }
}
</script>

<style scoped>
.panel{
}
</style>