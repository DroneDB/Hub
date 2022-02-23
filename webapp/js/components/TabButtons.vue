<template>
    <div class="buttons">
        <div v-for="t in tabs" class="tab-button" :class="{ active: activeTab === t.key, top: position === 'top', canClose: !!t.canClose }" @click="setActiveTab(t)">
            <i class="icon" :class="{padded: !!t.hideLabel, [t.icon]: true}" :title="t.label" /><span v-if="!t.hideLabel" class="mobile hide"> {{ t.label }}</span>
            <div @click.stop="closeTab(t)" v-if="!!t.canClose" class="close"><i class="icon close"></i></div>
        </div>
        <div v-if="buttonWidth === 'auto'" class="fill" :class="{ top: position === 'top', shadowed: lastTabSelected }">
        </div>
    </div>
</div>
</template>

<script>
export default {
  components: {
  },
  props: {
      tabs: {
          type: Array,
          required: true
      },
      defaultTab: {
          type: String,
          default: "",
      },
      position: {
          type: String,
          default: "bottom"
      },
      buttonWidth: {
          type: String,
          default: "expand" // one of "expand", "auto"
      }
  },
  data: function(){
      return {
          activeTab: this.defaultTab ? this.defaultTab : this.tabs[0].key
      };
  },
  computed: {
      lastTabSelected: function(){
          return this.tabs[this.tabs.length - 1].key === this.activeTab;
      }
  },
  mounted: function(){
  },
  methods: {
      closeTab: function(tab){
          this.$emit("closeTab", tab.key);
      },

      setActiveTab: function(tab, event = true){
          this.activeTab = tab.key;
          if (event) this.$emit("click", tab);
      }
  }
}
</script>

<style scoped>
.buttons{
    margin-top: auto;
    display: flex;
    user-select: none;
    -webkit-user-select: none;

    .fill, .tab-button{
        padding: 8px;
        text-align: center;
        border-top: 1px solid #000;
        &.top{
            border-top: none;
            border-bottom: 1px solid #000;
            background: #fefefe;
        }
    }
    .fill{
        flex-grow: 99;
        border-left: 1px solid #000;
        border-top: 1px solid #000;
        &.shadowed{
            box-shadow: inset 3px 0px 2px -3px;
        }
    }
    .tab-button {
        background-color: #eee;
        box-shadow: inset 2px 2px 3px -2px;
        border-top: 1px solid #000;
        border-left: 1px solid rgba(0,0,0,0);
        
        &.top{
            box-shadow: inset 2px -1px 3px -2px;
            border-top: none;
            border-bottom: 1px solid #000;
        }
        
        flex-grow: 1;


        &:hover {
            cursor: pointer;
            background-color: #dadada;
        }

        &.active {
            box-shadow: none;
            border-bottom: none;
            border-top: none;

            border-left: 1px solid #000;
            &:first-child{
                border-left: 1px solid rgba(0,0,0,0);

            }
            background-color: #fefefe;

            &:hover {
                cursor: default;
            }

            &.top{
                box-shadow: none;
            }
        }

        .icon.padded{
            padding-left: 3px;
        }

        &.canClose{
            padding-right: 0;
        }

        .close{
            display: inline-block;
            margin-left: 2px;
            padding: 0;
            &:hover{
                cursor: pointer;
                color: #444444;
            }
            &:active{
                color: #dddddd;
            }
        }
    }

    @media only screen and (max-width: 767px) {
        .tab-button{
            padding-left: 12px;
        }
    }
}
</style>