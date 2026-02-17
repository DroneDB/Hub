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

            <!-- Settings gear button (bottom-left) -->
            <button v-if="loaded" class="btn-settings" @click="toggleSettings" title="Lighting settings">
                <i class="icon cog" />
            </button>
        </div>

        <!-- Lighting settings Window dialog -->
        <Window v-if="showSettings" title="Lighting" id="nexus-lighting" @onClose="toggleSettings" fixedSize maxWidth="280px">
            <div class="lighting-content">
                <div class="form-group">
                    <label>Ambient: {{ ambientIntensity.toFixed(1) }}</label>
                    <input
                        type="range"
                        v-model.number="ambientIntensity"
                        min="0"
                        max="3"
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
                        max="3"
                        step="0.1"
                        @input="updateDirectional"
                    />
                </div>

                <div v-if="!modelInfo.hasTexture" class="form-group">
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

                <button class="ui mini fluid button" @click="resetDefaults">Reset</button>
            </div>
        </Window>
    </div>
</template>

<script>
import ddb from 'ddb';
import Message from './Message';
import TabViewLoader from './TabViewLoader';
import Window from './Window.vue';
import { loadResources } from '../libs/lazy';

const STORAGE_KEY = 'nexus-lighting-settings';

function loadSettings() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
    } catch (e) {
        // Ignore parse errors
    }
    return null;
}

function saveSettings(ambient, directional, shininess) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            ambientIntensity: ambient,
            directionalIntensity: directional,
            shininess: shininess
        }));
    } catch (e) {
        // Ignore storage errors
    }
}

export default {
    components: {
        Message, TabViewLoader, Window
    },
    props: ['uri'],
    data: function () {
        const DEFAULT_AMBIENT = 0.4;
        const DEFAULT_DIRECTIONAL = 0.7;
        const DEFAULT_SHININESS = 25;
        const saved = loadSettings();

        return {
            error: "",
            loading: false,
            loaded: false,
            showSettings: false,
            // Default lighting values (MeshLab style)
            DEFAULT_AMBIENT,
            DEFAULT_DIRECTIONAL,
            DEFAULT_SHININESS,
            // Reactive controls (restored from localStorage if available)
            ambientIntensity: saved ? saved.ambientIntensity : DEFAULT_AMBIENT,
            directionalIntensity: saved ? saved.directionalIntensity : DEFAULT_DIRECTIONAL,
            shininess: saved ? saved.shininess : DEFAULT_SHININESS,
            // Model info
            modelInfo: {
                hasTexture: false,
                hasColors: false,
                hasNormals: false
            },
            // Three.js references (set in loadNexus)
            ambientLight: null,
            hemisphereLight: null,
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
            scene.background = new THREE.Color(0x1a1a2e);
            scene.fog = new THREE.Fog(0x1a1a2e, 2000, 3500);

            // Lighting setup
            this.ambientLight = new THREE.AmbientLight(0xffffff, this.ambientIntensity);
            scene.add(this.ambientLight);

            // Hemisphere light for natural sky/ground fill
            this.hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.4);
            scene.add(this.hemisphereLight);

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

        toggleSettings: function () {
            this.showSettings = !this.showSettings;
        },

        persistSettings: function () {
            saveSettings(this.ambientIntensity, this.directionalIntensity, this.shininess);
        },

        updateAmbient: function () {
            if (this.ambientLight) {
                this.ambientLight.intensity = this.ambientIntensity;
            }
            this.persistSettings();
        },

        updateDirectional: function () {
            if (this.light1) {
                this.light1.intensity = this.directionalIntensity;
            }
            if (this.light2) {
                this.light2.intensity = this.directionalIntensity;
            }
            this.persistSettings();
        },

        updateShininess: function () {
            if (this.material) {
                this.material.shininess = this.shininess;
                this.material.needsUpdate = true;
            }
            this.persistSettings();
        },

        resetDefaults: function () {
            this.ambientIntensity = this.DEFAULT_AMBIENT;
            this.directionalIntensity = this.DEFAULT_DIRECTIONAL;
            this.shininess = this.DEFAULT_SHININESS;
            this.updateAmbient();
            this.updateDirectional();
            this.updateShininess();
            try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
        },
    }
}
</script>

<style scoped>
#nexus {
    background: #1a1a2e;
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

#nexus .btn-settings {
    position: absolute;
    bottom: 14px;
    left: 14px;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.65);
    border: 1px solid rgba(255, 255, 255, 0.25);
    color: #fefefe;
    font-size: 16px;
    cursor: pointer;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: background 0.2s, border-color 0.2s;
}

#nexus .btn-settings:hover {
    background: rgba(0, 0, 0, 0.85);
    border-color: rgba(255, 255, 255, 0.5);
}

#nexus .btn-settings .icon.cog {
    margin: 0;
    width: auto;
    height: auto;
}

#nexus .lighting-content {
    padding: 4px 0;
}

#nexus .lighting-content .form-group {
    margin-bottom: 12px;
}

#nexus .lighting-content .form-group label {
    display: block;
    margin-bottom: 4px;
    font-size: 12px;
    color: #555;
}

#nexus .lighting-content .form-group input[type="range"] {
    width: 100%;
    cursor: pointer;
}
</style>