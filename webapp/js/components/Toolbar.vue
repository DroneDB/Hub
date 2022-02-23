<template>
    <div class="toolbar" :class="className" >
        <template v-for="tool in dataTools">
            <div class="button" 
                    :class="{selected: tool.selected, disabled: tool.disabled}" 
                    :title="tool.title"
                    @click="toggleTool(tool.id)">
                <i :class="'icon ' + tool.icon"></i>
            </div>
        </template>
    </div>
</template>

<script>
//<div class="button selected" title="Select Features by Area (SHIFT)"><i class="icon square outline"></i></div>
        
export default {
  props: ["tools", "className"],
  data: function(){
    return {
        dataTools: []
    }
  },
  beforeMount: function(){
      this.refreshTools();
  },
  mounted: function(){
  },
  methods: {
      refreshTools: function(){
        // Make sure all keys are set for tools
        this.dataTools = [];
        (this.tools || []).forEach((t, idx) => {
            this.dataTools.push({
                    id: t.id || 'tool-' + idx,
                    icon: t.icon,
                    selected: t.selected || false,
                    disabled: t.disabled || false,
                    title: t.title || '',
                    onClick: t.onClick || false,
                    onSelect: t.onSelect || false,
                    onDeselect: t.onDeselect || false,
                    exclusiveGroup: t.exclusiveGroup,
                });
            
        });
      },

      getTool: function(toolId){
          return this.dataTools.find(t => t.id === toolId);
      },

      selectTool: function(toolId){
          const tool = this.getTool(toolId);
          if (tool.disabled) return;

          if (tool.onClick){
              tool.onClick();
          }
          
          if (tool.onSelect){
            tool.selected = true;
            tool.onSelect();
          }

          if (tool.exclusiveGroup){
              this.dataTools.forEach(t => {
                  if (t !== tool && t.exclusiveGroup === tool.exclusiveGroup && t.selected){
                      this.deselectTool(t.id);
                  }
              })
          }
      },

      deselectTool: function(toolId){
          const tool = this.getTool(toolId);
          if (tool.disabled) return;

          if (tool.onClick){
              tool.onClick();
          }

          tool.selected = false;
          if (tool.onDeselect){
              tool.onDeselect();
          }
      },

      disableToolIf: function(toolId, disabled){
          const tool = this.getTool(toolId);
          tool.disabled = disabled;
      },

      deselectAll: function(){
          this.dataTools.forEach(t => this.deselectTool(t.id));
      },

      toggleTool: function(toolId){
          const tool = this.getTool(toolId);
          if (tool.disabled) return;
        
          if (tool.selected) this.deselectTool(toolId);
          else this.selectTool(toolId);
      }
  },

  watch: {
      tools: function(newVal, oldVal){
          if (newVal.length !== oldVal.length){
            this.refreshTools();
          }
      }
  }
}
</script>

<style scoped>
.toolbar{
    user-select: none;
    -webkit-user-select: none;

    display: flex;
    background-image: linear-gradient(#fefefe, #f3f3f3);
    &.plain{
        background: #fefefe;
        border-bottom: 1px solid #030A03;
    }
    flex-direction: row;
    padding: 4px;
    min-height: 34px;
    .button{
        padding: 0;
        width: 26px;
        height: 26px;
        padding-left: 4px;
        padding-right: 4px;
        border-radius: 4px;
        @media only screen and (max-width: 767px) {
            width: 35px;
            height: 34px;
            padding-left: 7px;
            padding-right: 6px;
            padding-top: 2px;
        }
        margin-right: 1px;
        border: 1px solid transparent;
        &.selected{
            cursor: pointer;
            border-color: #030A03;
            background: #fefefe;
        }
        @media (hover: hover) {
            &:hover{
                cursor: pointer;
                border-color: #030A03;
                background: #fefefe;
            }
        }
        &:active{
            background: #f8f8f8;
        }
        i{
            padding-top: 3px;
            padding-left: 0px;
            margin: 0;
        }

        &.disabled{
            opacity: 0.2;
            &:hover,&:active,&:focus,&.selected{
                cursor: not-allowed;
            }
        }
    }

    &.large{
        height: 44px;
        .button{
            width: 36px;
            height: 36px;
            padding-left: 2px;
            padding-right: 2px;
            padding-top: 2px;
            padding-bottom: 2px;
        }
        i{
            font-size: 200%;
        }
    }

    &.top-border{
        border-top: 1px solid #030A03;
    }
}
</style>