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

            <!-- Lighting controls panel (only for models without texture) -->
            <div v-if="loaded && !modelInfo.hasTexture" class="controls-panel">
                <div class="controls-header">
                    <span>Lighting</span>
                </div>

                <div class="form-group">
                    <label>Ambient: {{ ambientIntensity.toFixed(1) }}</label>
                    <input
                        type="range"
                        v-model.number="ambientIntensity"
                        min="0"
                        max="2"
                        step="0.1"
                        @input="updateAmbient"
                    />
                </div>

                <div class="form-group">
                    <label>Directional: {{ directionalIntensity.toFixed(1) }}</label>
                    <input
                        type="range"
                        v-model.number="directionalIntensity"
                        min="0"
                        max="2"
                        step="0.1"
                        @input="updateDirectional"
                    />
                </div>

                <div class="form-group">
                    <label>Shininess: {{ shininess }}</label>
                    <input
                        type="range"
                        v-model.number="shininess"
                        min="0"
                        max="100"
                        step="5"
                        @input="updateShininess"
                    />
                </div>

                <button class="btn-reset" @click="resetDefaults">Reset</button>
            </div>
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
    data: function () {
        return {
            error: "",
            loading: false,
            loaded: false,
            // Default lighting values (MeshLab style)
            DEFAULT_AMBIENT: 0.4,
            DEFAULT_DIRECTIONAL: 0.8,
            DEFAULT_SHININESS: 25,
            // Reactive controls
            ambientIntensity: 0.4,
            directionalIntensity: 0.8,
            shininess: 25,
            // Model info
            modelInfo: {
                hasTexture: false,
                hasColors: false,
                hasNormals: false
            },
            // Three.js references (set in loadNexus)
            ambientLight: null,
            light1: null,
            light2: null,
            material: null,
            nexusObj: null
        };
    },
    mounted: function () {
    },

    methods: {
        handleLoad: async function () {
            try {
                // Quick type check
                if (this.entry.type !== ddb.entry.type.MODEL)
                  throw new Error(`${this.entry.path} cannot be opened as a 3D model`);

                this.loading = true;

                await loadResources("/potree/libs/three.js/build/three.min.js");
                await loadResources("/nexus/nexus.js");
                await loadResources("/nexus/nexusThree.js");
                await loadResources("/nexus/arcballControls.js");

                await this.loadNexus();

            } catch (e) {
                this.error = e.message;
            } finally {
                this.loading = false;
            }
        },
        loadNexus: async function () {
            this.error = "";

            // Check that libraries are loaded
            if (typeof THREE === 'undefined') {
                throw new Error('Error loading THREE.js library');
            }
            if (typeof NexusObject === 'undefined') {
                throw new Error('Error loading Nexus library');
            }

            const camera = new THREE.PerspectiveCamera(35, 2, 0.1, 100);
            camera.position.z = 4.0;

            const scene = new THREE.Scene();
            scene.background = new THREE.Color(0x000000);
            scene.fog = new THREE.Fog(0x050505, 2000, 3500);

            // Lighting setup with MeshLab-style defaults
            this.ambientLight = new THREE.AmbientLight(0x404040, this.ambientIntensity);
            scene.add(this.ambientLight);

            this.light1 = new THREE.DirectionalLight(0xffffff, this.directionalIntensity);
            this.light1.position.set(1, 1, -1);
            scene.add(this.light1);

            this.light2 = new THREE.DirectionalLight(0xffffff, this.directionalIntensity);
            this.light2.position.set(-1, -1, 1);
            scene.add(this.light2);

            const renderer = new THREE.WebGLRenderer({ canvas: this.$refs.canvas, antialias: false });
            renderer.setClearColor(scene.fog.color);
            renderer.setPixelRatio(window.devicePixelRatio);

            // Create MeshPhongMaterial for models without texture (MeshLab-style shading)
            this.material = new THREE.MeshPhongMaterial({
                color: 0xaaaaaa,
                specular: 0x444444,
                shininess: this.shininess
            });

            // Will be set after loading based on model info
            let material = false;

            const self = this;

            let nexusObj = null;

            const onNexusLoad = () => {
                const s = 1 / nexusObj.geometry.boundingSphere.radius;
                const target = new THREE.Vector3();
                const p = nexusObj.geometry.boundingBox.getCenter(target).negate();

                nexusObj.position.set(p.x * s, p.y * s, p.z * s);
                nexusObj.scale.set(s, s, s);

                // Detect model info from Nexus geometry
                const instance = nexusObj.geometry.instance;
                if (instance && instance.mesh && instance.mesh.vertex) {
                    self.modelInfo.hasTexture = !!instance.mesh.vertex.texCoord;
                    self.modelInfo.hasColors = !!instance.mesh.vertex.color;
                    self.modelInfo.hasNormals = !!instance.mesh.vertex.normal;
                }

                // Apply MeshPhongMaterial only for models without texture
                if (!self.modelInfo.hasTexture) {
                    nexusObj.material = self.material;
                }

                self.nexusObj = nexusObj;
                self.loaded = true;
            }

            const resizeCanvasToDisplaySize = () => {
                const canvas = renderer.domElement;
                const width = canvas.clientWidth;
                const height = canvas.clientHeight;
                if (canvas.width !== width || canvas.height !== height) {
                    renderer.setSize(width, height, false);
                    camera.aspect = width / height;
                    camera.updateProjectionMatrix();
                }
            }

            const entry = this.dataset.Entry(this.entry);
            var model = await entry.getNxz();

            nexusObj = new NexusObject(model, onNexusLoad, () => { }, renderer, material);
            scene.add(nexusObj);

            const controls = new THREE.ArcballControls(camera, renderer.domElement, scene);
            controls.setGizmosVisible(false);

            const animate = () => {
                requestAnimationFrame(animate);
                resizeCanvasToDisplaySize();
                renderer.render(scene, camera);
                controls.update();
            }

            animate();
        },

        handleGoToDataset: function () {
            this.$router.push({ name: 'ViewDataset', params: { org: this.dataset.org, ds: this.dataset.ds } });
        },

        updateAmbient: function () {
            if (this.ambientLight) {
                this.ambientLight.intensity = this.ambientIntensity;
            }
        },

        updateDirectional: function () {
            if (this.light1) {
                this.light1.intensity = this.directionalIntensity;
            }
            if (this.light2) {
                this.light2.intensity = this.directionalIntensity;
            }
        },

        updateShininess: function () {
            if (this.material) {
                this.material.shininess = this.shininess;
                this.material.needsUpdate = true;
            }
        },

        resetDefaults: function () {
            this.ambientIntensity = this.DEFAULT_AMBIENT;
            this.directionalIntensity = this.DEFAULT_DIRECTIONAL;
            this.shininess = this.DEFAULT_SHININESS;
            this.updateAmbient();
            this.updateDirectional();
            this.updateShininess();
        },
    }
}
</script>

<style scoped>
#nexus {
    background: #030A03;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

#nexus .ui.message {
    margin: 8px;
}

#nexus .container {
    display: flex;
    width: 100%;
    height: 100%;
    position: relative;
}

#nexus .container canvas {
    display: flex;
    width: 100%;
    height: 100%;
}

#nexus .loading {
    color: #fefefe;
    font-size: 120%;
    margin: 8px;
    text-align: center;
}

#nexus .loading .circle.notch {
    height: 20px;
    width: 22px;
}

#nexus .controls-panel {
    position: absolute;
    top: 10px;
    right: 10px;
    background: rgba(0, 0, 0, 0.75);
    border-radius: 8px;
    padding: 12px 16px;
    color: #fefefe;
    min-width: 180px;
    font-size: 13px;
    z-index: 100;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

#nexus .controls-panel .controls-header {
    font-weight: 600;
    font-size: 14px;
    margin-bottom: 10px;
    padding-bottom: 6px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.2);
}

#nexus .controls-panel .form-group {
    margin-bottom: 10px;
}

#nexus .controls-panel .form-group label {
    display: block;
    margin-bottom: 4px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.8);
}

#nexus .controls-panel .form-group input[type="range"] {
    width: 100%;
    height: 4px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.2);
    outline: none;
    cursor: pointer;
    -webkit-appearance: none;
    appearance: none;
}

#nexus .controls-panel .form-group input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #4a9eff;
    cursor: pointer;
}

#nexus .controls-panel .form-group input[type="range"]::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #4a9eff;
    cursor: pointer;
    border: none;
}

#nexus .controls-panel .btn-reset {
    width: 100%;
    padding: 6px 12px;
    margin-top: 6px;
    background: rgba(255, 255, 255, 0.15);
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 4px;
    color: #fefefe;
    font-size: 12px;
    cursor: pointer;
    transition: background 0.2s, border-color 0.2s;
}

#nexus .controls-panel .btn-reset:hover {
    background: rgba(255, 255, 255, 0.25);
    border-color: rgba(255, 255, 255, 0.5);
}
</style>