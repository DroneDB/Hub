<template>
    <div id="potree">
        <TabViewLoader @loaded="handleLoad" titleSuffix="Point Cloud" />

        <Message bindTo="error" noDismiss />
        <div v-if="loading" class="loading">
            <p>Loading point cloud...</p> 
            <i class="icon circle notch spin" />
        </div>
        
        <div class="potree-container" :class="{loading}">
            <div id="potree_sidebar_container" ref="sidebar"> </div>
            <div id="potree_render_area" ref="container"></div>
        </div>
    </div>
</template>

<script>
import ddb from 'ddb';
import Message from './Message';
import TabViewLoader from './TabViewLoader';
import { loadResources } from '../libs/lazy';

export default {
  components: {
      Message, TabViewLoader
  },
  props: ['uri'],
  data: function(){
      return {
          error: "",
          loading: false,
          loaded: false
      };
  },
  mounted: function(){
  },
  
  methods:{

      handleLoad: async function(){
        try{
            // Quick type check
            if (this.entry.type !== ddb.entry.type.POINTCLOUD) throw new Error(`${this.entry.path} cannot be opened as a point cloud`);

            this.loading = true;

            await loadResources("/potree/build/potree/potree.isolated.min.css");
            await loadResources("/potree/libs/jquery-ui/jquery-ui.min.css");
            await loadResources("/potree/libs/spectrum/spectrum.css");
            await loadResources("/potree/libs/jstree/themes/mixed/style.css");
            await loadResources("/potree/libs/jquery/jquery-3.1.1.min.js");                
            await loadResources("/potree/libs/spectrum/spectrum.js");
            await loadResources("/potree/libs/jquery-ui/jquery-ui.min.js");
            await loadResources("/potree/libs/three.js/build/three.min.js");
            await loadResources("/potree/libs/three.js/extra/lines.js");
            await loadResources("/potree/libs/other/BinaryHeap.js");
            await loadResources("/potree/libs/tween/tween.min.js");
            await loadResources("/potree/libs/d3/d3.js");
            await loadResources("/potree/libs/proj4/proj4.js");
            await loadResources("/potree/libs/i18next/i18next.js");
            await loadResources("/potree/libs/jstree/jstree.js");
            await loadResources("/potree/build/potree/potree.js");
            await loadResources("/potree/libs/plasio/js/laslaz.js");

            await this.loadViewer();

        }catch(e){
            this.error = e.message;
        }finally{
            this.loading = false;
        }
      },
      loadViewer: async function(){
        this.error = "";

        if (this.viewer){
            this.viewer = null;
            this.$refs.container.innerHTML = '';
        }

        let viewer = new Potree.Viewer(this.$refs.container);

        viewer.toggleSidebar = () => {
                let renderArea = this.$refs.container;
                let isVisible = renderArea.style.right === '300px';

                if (isVisible) {
                    renderArea.style.right = '0px';
                } else {
                    renderArea.style.right = '300px';
                }
        };
        viewer.setEDLEnabled(false);
        viewer.setFOV(60);
        viewer.setPointBudget(10*1000*1000);
        viewer.loadGUI(() => {
            viewer.setLanguage('en');
            $("#menu_tools").next().show();
            // viewer.toggleSidebar();
        });

        viewer.scene.scene.add( new THREE.AmbientLight( 0x404040, 2.0 ) ); // soft white light );
        viewer.scene.scene.add( new THREE.DirectionalLight( 0xcccccc, 0.5 ) );

        const directional = new THREE.DirectionalLight( 0xcccccc, 0.5 );
        directional.position.z = 99999999999;
        viewer.scene.scene.add( directional );

        this.loaded = true;
        this.viewer = viewer;

        await this.addPointCloud(this.dataset.Entry(this.entry));
        this.viewer.fitToScreen();
        window.viewer = viewer;
        // if (pointCloudFiles.length === 0) this.error = "No point cloud files selected. Select one or more point cloud files to display them.";
      },

      addPointCloud: async function(entry){
          return new Promise(async (resolve, reject) => {
            try{
                const eptUrl = await entry.getEpt();
                const basename = ddb.pathutils.basename(entry.path);

                Potree.loadPointCloud(eptUrl, basename, e => {
                    if (e.type == "loading_failed"){
                        reject(new Error(`Cannot load ${entry.path}, we're still building it. Try again in a few minutes.`));
                        return;
                    }

                    this.viewer.scene.addPointCloud(e.pointcloud);
                    e.pointcloud.material.size = 1;

                    resolve();
                });
            }catch(e){
                reject(new Error(`${entry.path} is being built. Try to refresh the page in a few minutes!`));
            }
          });
      },
      handleHistoryBack: function(){
        this.$router.push({ name: 'ViewDataset', params: { org: this.dataset.org, ds: this.dataset.ds } });
      },
  }      
}
</script>

<style>
#potree{
    .ui.message{
        margin: 8px;
    }

    background: #030A03;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    .loading{
        color: #fefefe;
        font-size: 120%;
        margin: 8px;
        text-align: center;
        .circle.notch {
            height: 20px;
            width: 22px;
        }
    }

    #potree_quick_buttons{
        left: auto !important;
        right: 40px !important;
    }

    .potree-container{
        &.loading{
            visibility: hidden;
        }
        margin: 1px 50px 0 0;
        display: flex;
        width: 100%;
        height: 100%;
        background: rgb(79,79,79);
        background: -moz-radial-gradient(center, ellipse cover, rgba(79,79,79,1) 0%, rgba(22,22,22,1) 100%);
        background: -webkit-gradient(radial, center center, 0px, center center, 100%, color-stop(0%,rgba(79,79,79,1)), color-stop(100%,rgba(22,22,22,1)));
        background: -webkit-radial-gradient(center, ellipse cover, rgba(79,79,79,1) 0%,rgba(22,22,22,1) 100%);
        background: -o-radial-gradient(center, ellipse cover, rgba(79,79,79,1) 0%,rgba(22,22,22,1) 100%);
        background: -ms-radial-gradient(center, ellipse cover, rgba(79,79,79,1) 0%,rgba(22,22,22,1) 100%);
        background: radial-gradient(ellipse at center, rgba(79,79,79,1) 0%,rgba(22,22,22,1) 100%);
    	position: relative;
    	padding: 0;

        #potree_render_area{
            -webkit-transition: right .35s;
            transition: right .35s;
        }

        #potree_render_area > canvas{
            width: 100% !important;
            height: 100% !important;
        }
    }

    .dg{
	    &.main{
		    position: absolute;
		    right: 0px;
	    }
	    .c{
	    	select{
	    		color: black;
	    	}
	    }
    }


    /* Potree specific */
    #potree_map{
        position: absolute; 
        left: 50px; 
        top: 50px; 
        width: 400px; 
        height: 400px;
        display: none
    }

    #potree_menu{
        input{
            color: buttontext;
        }
        legend{
            display: initial !important;
            width: initial !important;
            padding: initial !important;
            margin-bottom: initial !important;
            font-size: inherit !important;
            line-height: initial !important;
            color: inherit !important;
            border: initial !important;
            border-bottom: initial !important;
        }

        #show_2d_profile{
            color: initial !important;
        }
    }

    #potree_map_header{
        position: absolute; 
        width: 100%; 
        height: 25px; 
        top: 0px; 
        background-color: rgba(0,0,0,0.5); 
        z-index: 1000;
        border-top-left-radius: 3px; 
        border-top-right-radius: 3px;
    }

    #potree_map_content{
        position: absolute; 
        z-index: 100; 
        top: 25px; 
        width: 100%; 
        height: calc(100% - 25px); 
        border: 2px solid rgba(0,0,0,0.5); 
        box-sizing: border-box;
    }

    #potree_sidebar_container{
        overflow-y: auto;
        overflow-x: hidden;
        background-color: #19282c;
        right: 0;

        a{
            color: #111;
        }  

        #sidebar_root{
            width: 300px;

            .pv-menu-list{
                padding-right: 12px;

                .divider{
                    padding: 10px 0px 15px 0px;
                }

                a{
                    color: #8Aa1c4;
                } 
            }

            .measurement-panel-remove:hover{
                cursor: pointer;
            }

            position: absolute; 
            min-height: 100%; 
            height: 100%;

            .potree_sidebar_brand{
                display: flex; 
                flex-direction: row;
            }

            #potree_version_number{
                color: #9AA1A4; 
                font-size: 80%; 
                font-weight: 100;
            }
        }
    }

    #profile_window{
        z-index: 999999999999 !important;
    }
}
</style>