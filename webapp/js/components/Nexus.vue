<template>
    <div id="nexus">
        <TabViewLoader @loaded="handleLoad" titleSuffix="Model" />

        <Message bindTo="error" noDismiss />
        <div v-if="loading" class="loading">
            <p>Loading model...</p> 
            <i class="icon circle notch spin" />
        </div>

        <div class="container">
            <canvas ref="canvas"></canvas>
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
            if (this.entry.type !== ddb.entry.type.MODEL) throw new Error(`${this.entry.path} cannot be opened as a model`);

            this.loading = true;

            await loadResources("/potree/libs/three.js/build/three.min.js");
            await loadResources("/nexus/nexus.js");
            await loadResources("/nexus/nexusThree.js");
            await loadResources("/nexus/arcballControls.js");

            await this.loadNexus();

        }catch(e){
            this.error = e.message;
        }finally{
            this.loading = false;
        }
      },
      loadNexus: async function(){
        this.error = "";

        const camera = new THREE.PerspectiveCamera( 35, 2, 0.1, 100 );
        camera.position.z = 4.0;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color( 0x000000 );
        scene.fog = new THREE.Fog( 0x050505, 2000, 3500 );
        scene.add( new THREE.AmbientLight( 0x404040, 4 ) );

        const light1 = new THREE.DirectionalLight( 0xffffff, 0.2 );
        light1.position.set( 1, 1, -1 );
        scene.add( light1 );

        const light2 = new THREE.DirectionalLight( 0xffffff, 0.2 );
        light2.position.set( -1, -1, 1 );
        scene.add( light2 );

        const renderer = new THREE.WebGLRenderer( { canvas: this.$refs.canvas, antialias: false } );
        renderer.setClearColor( scene.fog.color );
        renderer.setPixelRatio( window.devicePixelRatio );
        
        let nexusObj = null;

        const onNexusLoad = () => {
            const s   = 1/nexusObj.geometry.boundingSphere.radius;
            const target = new THREE.Vector3();
            const p = nexusObj.geometry.boundingBox.getCenter(target).negate();

            nexusObj.position.set(p.x*s, p.y*s, p.z*s);
            nexusObj.scale.set(s, s, s);
        //	nexusObj.material = new THREE.PointsMaterial( {  size:3, color: 0x00ff00, transparent: false, opacity:0.25 } );
        }

        const resizeCanvasToDisplaySize = () => {
            const canvas = renderer.domElement;
            const width = canvas.clientWidth;
            const height = canvas.clientHeight;
            if (canvas.width !== width ||canvas.height !== height) {
                renderer.setSize(width, height, false);
                camera.aspect = width / height;
                camera.updateProjectionMatrix();
            }
        }

        const entry = this.dataset.Entry(this.entry);
        var model = await entry.getNxz();

        nexusObj = new NexusObject(model, onNexusLoad, () => { }, renderer, material);
        scene.add(nexusObj);

        /* An appropriate material can be used as optional fifth arg for the NexusObject constructor */
        let material = false;
        /* Material customizations examples: */
        //let material = new THREE.MeshLambertMaterial( { color: 0xff0000, vertexColors: THREE.VertexColors } );

        const controls = new THREE.ArcballControls( camera, renderer.domElement, scene );
        controls.setGizmosVisible(false);

        const animate = () => {
            requestAnimationFrame(animate);
            resizeCanvasToDisplaySize();
            renderer.render( scene, camera );
            controls.update();
        }

        animate();
      },

    handleGoToDataset: function(){
        this.$router.push({ name: 'ViewDataset', params: { org: this.dataset.org, ds: this.dataset.ds } });
    },
  }
}
</script>

<style>
#nexus{
    .ui.message{
        margin: 8px;
    }

    background: #030A03;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    .container{
        display: flex;
        width: 100%;
        height: 100%;
        position: relative;
        canvas{
            display: flex;
            width: 100%;
            height: 100%;
        }
    }
    
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
}
</style>