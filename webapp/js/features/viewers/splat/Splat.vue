<template>
    <div id="splat">
        <TabViewLoader @loaded="handleLoad" titleSuffix="Gaussian Splat" />

        <Message bindTo="error" noDismiss />
        <div v-if="loading" class="loading">
            <p>Loading Gaussian Splat...</p>
            <i class="fa-solid fa-circle-notch fa-spin" />
        </div>

        <div class="container-wrapper">
            <canvas ref="canvas"></canvas>

            <!-- Top-right stack: current camera view + CRS badge -->
            <div class="top-right-stack">
                <!-- Current camera preset (only when a preset is active) -->
                <div v-if="loaded && activeCameraName" class="camera-hud" title="Current camera view">
                    <i class="fa-solid fa-camera" /> {{ activeCameraName }}
                </div>

                <!-- CRS badge (only when the splat is georeferenced) -->
                <div v-if="loaded && crs" class="crs-badge" :title="`Coordinate reference system: ${crs}`">
                    <i class="fa-solid fa-location-crosshairs" /> {{ crs }}
                </div>
            </div>

            <!-- LOD streaming badge (only when serving a paged .rad) -->
            <div v-if="loaded && streaming" class="streaming-badge" title="Level-of-detail streaming: only the detail in view is downloaded">
                <i class="fa-solid fa-tower-broadcast" />
            </div>

            <!-- Bottom-left buttons -->
            <div v-if="loaded" class="btn-stack">
                <button class="btn-overlay" @click="toggleSettings" title="View settings">
                    <i class="fa-solid fa-gear" />
                </button>
                <button class="btn-overlay" @click="toggleCameraManager" title="Manage camera views">
                    <i class="fa-solid fa-camera" />
                </button>
            </div>

            <!-- Navigation controls recap (bottom-right). Doubles as press-and-hold
                 touch/mouse buttons that drive the same movement as the keyboard. -->
            <div v-if="loaded" class="nav-controls" :class="{ touch: isTouch }">
                <div class="nav-grid">
                    <button v-for="k in navKeys" :key="k.code" class="nav-key"
                        :title="`${k.label} (${k.letter})`"
                        @pointerdown.prevent="pressDir(k.code, $event)"
                        @pointerup="releaseDir(k.code)"
                        @pointerleave="releaseDir(k.code)"
                        @pointercancel="releaseDir(k.code)"
                        @contextmenu.prevent>
                        <i :class="k.icon" />
                        <span class="letter">{{ k.letter }}</span>
                    </button>
                </div>
            </div>
        </div>

        <!-- View settings dialog -->
        <Window v-if="showSettings" title="View settings" id="splat-settings" @onClose="toggleSettings" fixedSize sizeClass="dialog-xs">
            <div class="settings-content">
                <div class="form-group">
                    <label class="checkbox-row">
                        <input type="checkbox" v-model="flipped" @change="applyOrientation" />
                        <span>Flip up axis</span>
                    </label>
                    <small>Toggle if the scene appears upside down.</small>
                </div>

                <div class="form-group">
                    <div><label>Point size: {{ pointScale.toFixed(2) }}x</label></div>
                    <div><input class="w-100"
                        type="range"
                        v-model.number="pointScale"
                        min="0.25"
                        max="3"
                        step="0.05"
                        @input="updatePointScale"
                    /></div>
                </div>

                <div class="settings-actions">
                    <Button label="Reset view" icon="fa-solid fa-house" @click="resetView" text />
                    <Button label="Save current view" icon="fa-solid fa-camera" @click="saveCurrentView" text :disabled="!canWrite" />
                    <Button label="Manage cameras" icon="fa-solid fa-sliders" @click="toggleCameraManager" text />
                    <Button label="Close" severity="secondary" @click="toggleSettings" text />
                </div>
            </div>
        </Window>

        <!-- Camera management dialog -->
        <CameraManager v-if="showCameraManager"
            :cameras="cameras"
            :canWrite="canWrite"
            :dirty="camerasDirty"
            :activeIndex="activeCameraIndex"
            @goto="setCamera"
            @add-current="addCurrentCamera"
            @update-current="updateCameraToCurrent"
            @delete="deleteCamera"
            @move="moveCamera"
            @rename="renameCamera"
            @save="saveCameras"
            @close="toggleCameraManager" />
    </div>
</template>

<script>
import ddb from 'ddb';
import Message from '@/components/Message';
import TabViewLoader from '@/features/viewers/TabViewLoader';
import Window from '@/components/Window.vue';
import Button from 'primevue/button';
import CameraManager from './CameraManager.vue';

// Immersive navigation keys, in the 2x3 layout shown in the on-screen overlay:
//   Q (down)    W (forward)   E (up)
//   A (left)    S (backward)  D (right)
const NAV_KEYS = [
    { code: 'KeyQ', letter: 'Q', label: 'Down', icon: 'fa-solid fa-angle-down' },
    { code: 'KeyW', letter: 'W', label: 'Forward', icon: 'fa-solid fa-arrow-up' },
    { code: 'KeyE', letter: 'E', label: 'Up', icon: 'fa-solid fa-angle-up' },
    { code: 'KeyA', letter: 'A', label: 'Left', icon: 'fa-solid fa-arrow-left' },
    { code: 'KeyS', letter: 'S', label: 'Backward', icon: 'fa-solid fa-arrow-down' },
    { code: 'KeyD', letter: 'D', label: 'Right', icon: 'fa-solid fa-arrow-right' }
];

export default {
    components: {
        Message, TabViewLoader, Window, Button, CameraManager
    },
    props: ['uri'],
    data: function () {
        return {
            error: "",
            loading: false,
            loaded: false,
            showSettings: false,
            showCameraManager: false,
            crs: null,
            streaming: false,      // true when streaming a paged .rad (progressive LOD)
            flipped: true,         // most INRIA/3DGS scenes render upside down without this
            pointScale: 1.0,
            isTouch: false,        // pointer-capable touch device (enlarges the nav overlay)
            navKeys: NAV_KEYS,
            // Dataset permissions, populated by TabViewLoader before @loaded fires.
            canWrite: false,
            canDelete: false,
            canRead: false,
            // Camera presets loaded from / saved to the <basename>_cameras.json sidecar.
            cameras: [],
            activeCameraIndex: null,
            camerasDirty: false
        };
    },
    computed: {
        activeCameraName: function () {
            if (this.activeCameraIndex === null) return null;
            const c = this.cameras[this.activeCameraIndex];
            return c ? (c.name || `Camera ${this.activeCameraIndex + 1}`) : null;
        }
    },
    // three.js / Spark objects are stored as plain (non-reactive) instance fields.
    // They must NOT live in data(): Vue's reactive proxy around WebGL/three objects
    // breaks internal matrix/identity checks, and `_`-prefixed data keys are not even
    // proxied onto `this`. We initialize them imperatively in loadSplat().
    created: function () {
        this.three = null;
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.controls = null;
        this.splatMesh = null;
        this.spark = null;
        this.rafId = null;
        this.resizeObserver = null;
        this.initialCameraPos = null;
        this.initialTarget = null;
        this.frameTimer = null;
        this.bounds = null;
        // Fly-navigation state (non-reactive: updated every animation frame).
        this.activeKeys = new Set();
        this.boundsDiagonal = 1;
        this.lastFrameTime = 0;
        // Default-animation state machine (tour between presets, or slow auto-orbit).
        this.animating = false;
        this.animState = null;
        // On-disk path of the camera sidecar, resolved from the entry path in loadCameras().
        this.camerasPath = null;
        // Stable bound handlers so they can be removed on unmount.
        this.onKeyDownBound = this.onKeyDown.bind(this);
        this.onKeyUpBound = this.onKeyUp.bind(this);
        this.onWindowBlurBound = () => { this.activeKeys.clear(); };
        this.onUserInteractBound = () => this.onUserInteract();
        // FPS click-drag rotation state (non-reactive: touched every animation frame).
        this.yaw = 0;
        this.pitch = 0;
        this.mouseDragging = false;
        this.mouseDragX = 0;
        this.mouseDragY = 0;
        this.lookDist = 1;
        this.onCanvasMouseDownBound = this.onCanvasMouseDown.bind(this);
        this.onCanvasMouseMoveBound = this.onCanvasMouseMove.bind(this);
        this.onCanvasMouseUpBound = this.onCanvasMouseUp.bind(this);
        // Accumulated velocity for smooth WASD acceleration (THREE.Vector3, lazy init).
        this.flyVelocity = null;
    },
    mounted: function () {
        this.isTouch = (typeof window !== 'undefined') &&
            (('ontouchstart' in window) || (navigator && navigator.maxTouchPoints > 0));
        window.addEventListener('keydown', this.onKeyDownBound);
        window.addEventListener('keyup', this.onKeyUpBound);
        window.addEventListener('blur', this.onWindowBlurBound);
    },
    beforeUnmount: function () {
        window.removeEventListener('keydown', this.onKeyDownBound);
        window.removeEventListener('keyup', this.onKeyUpBound);
        window.removeEventListener('blur', this.onWindowBlurBound);
        this.disposeViewer();
    },
    methods: {
        handleLoad: async function () {
            try {
                if (this.entry.type !== ddb.entry.type.GAUSSIAN_SPLAT)
                    throw new Error(`${this.entry.path} cannot be opened as a Gaussian Splat`);

                this.loading = true;
                await this.loadSplat();
            } catch (e) {
                this.error = e.message;
            } finally {
                this.loading = false;
            }
        },

        loadSplat: async function () {
            this.error = "";

            const entry = this.dataset.Entry(this.entry);

            // Prefer the level-of-detail artifact (model.rad): it lets Spark stream splats
            // progressively (coarse-first, fetch detail on demand) via HTTP range requests.
            // The plain .spz is only a fallback for legacy datasets built before LOD existed.
            // getGsplat() throws when model.spz is absent, so it must NOT be called when a
            // .rad is present (otherwise a .rad-only dataset would error out).
            const radUrl = await entry.getGsplatLod();
            let spzUrl = null;
            if (!radUrl) {
                spzUrl = await entry.getGsplat(); // throws a friendly message if neither exists
            }
            this.streaming = !!radUrl;

            // Build-time bounding box for deterministic camera framing (see frameCamera). For a
            // paged .rad this is the only reliable source of bounds at load time.
            this.bounds = await entry.getGsplatBounds();

            // Optional georeferencing sidecar (informational in the standalone viewer).
            try {
                const georefUrl = await entry.getGeoref();
                if (georefUrl) {
                    const resp = await fetch(georefUrl);
                    if (resp.ok) {
                        const georef = await resp.json();
                        this.crs = georef && georef.srs ? georef.srs : null;
                    }
                }
            } catch (e) {
                // Georeferencing is optional; ignore failures.
            }

            // Load the camera presets sidecar (best-effort; absent for most datasets).
            await this.loadCameras();

            // Lazy-load three.js, its OrbitControls and Spark only when the viewer opens.
            // These pull in WebGL + WASM and must not be in the main bundle.
            const THREE = await import(/* webpackChunkName: "three" */ 'three');
            const { OrbitControls } = await import(
                /* webpackChunkName: "three" */ 'three/examples/jsm/controls/OrbitControls.js');
            const { SparkRenderer, SplatMesh } = await import(
                /* webpackChunkName: "spark" */ '@sparkjsdev/spark');

            this.three = THREE;

            const canvas = this.$refs.canvas;
            const width = canvas.clientWidth || 1;
            const height = canvas.clientHeight || 1;

            const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
            renderer.setPixelRatio(window.devicePixelRatio);
            renderer.setSize(width, height, false);
            this.renderer = renderer;

            const scene = new THREE.Scene();
            scene.background = new THREE.Color(0x1a1a2e);
            this.scene = scene;

            const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
            camera.position.set(0, 0, 4);
            this.camera = camera;

            // SparkRenderer drives the splat sorting/rendering inside the three.js scene.
            // When streaming a paged .rad, foveation concentrates the splat budget toward the
            // view direction and pagedExtSplats gives the paged pool extra coordinate precision.
            const spark = this.streaming
                ? new SparkRenderer({
                    renderer,
                    pagedExtSplats: true,
                    coneFov0: 70.0,
                    coneFov: 120.0,
                    behindFoveate: 0.2,
                    coneFoveate: 0.4
                })
                : new SparkRenderer({ renderer });
            scene.add(spark);
            this.spark = spark;

            const controls = new OrbitControls(camera, renderer.domElement);
            // OrbitControls is kept for right-click pan and scroll-wheel zoom only.
            // FPS click-drag rotation is handled by our own canvas mouse listeners below.
            controls.enableRotate = false;
            controls.enableDamping = false;
            // Any OrbitControls pan/zoom interaction cancels the running presentation.
            controls.addEventListener('start', this.onUserInteractBound);
            this.controls = controls;

            // Attach FPS drag listeners: left-button click-drag rotates the camera in place.
            canvas.addEventListener('mousedown', this.onCanvasMouseDownBound);
            canvas.addEventListener('mousemove', this.onCanvasMouseMoveBound);
            canvas.addEventListener('mouseup', this.onCanvasMouseUpBound);
            canvas.addEventListener('mouseleave', this.onCanvasMouseUpBound);

            // Load the splat. With a .rad (paged: true) Spark fetches LOD chunks on demand via
            // HTTP range requests; with a plain .spz (lod: true) it downloads the whole file and
            // builds the LOD structure client-side in a background worker. Auth rides on the
            // same-origin jwtToken cookie, which the streaming worker's fetch sends automatically.
            const splatMesh = this.streaming
                ? new SplatMesh({ url: radUrl, paged: true })
                : new SplatMesh({ url: spzUrl, lod: true });
            this.splatMesh = splatMesh;
            scene.add(splatMesh);

            // Wait for the splat to be parsed/initialized before framing the camera.
            await splatMesh.initialized;

            this.applyOrientation();
            // For a paged .rad the bounding box is empty at init time (chunks stream in after),
            // so we frame once the first splats are resident. For a plain .spz the box is ready
            // immediately and this frames on the first try.
            this.frameCameraWhenReady();
            this.loaded = true;

            // Start the default presentation: a tour through the saved presets when any exist,
            // otherwise a slow auto-orbit. Stops on any user interaction; resume with "P".
            this.startDefaultAnimation();

            // Render loop. Spark drives its per-frame LOD traversal and (for paged .rad) chunk
            // streaming from renderer.render via onBeforeRender, so the loop must run every frame.
            renderer.setAnimationLoop((time) => {
                const now = time || (typeof performance !== 'undefined' ? performance.now() : Date.now());
                const dt = this.lastFrameTime ? Math.min((now - this.lastFrameTime) / 1000, 0.1) : 0;
                this.lastFrameTime = now;

                this.resizeCanvasToDisplaySize();

                // Keyboard / on-screen fly movement takes priority and cancels any animation.
                if (this.updateFly(dt)) this.stopAnimation();
                else if (this.animating) this.updateDefaultAnimation(dt);

                controls.update();

                // controls.update() calls camera.lookAt(target) every frame, which would
                // reset our FPS quaternion. Reassert it immediately after, except during
                // animations that drive the camera direction themselves.
                if (!this.animating) {
                    // Normal FPS mode: restore stored yaw/pitch.
                    this.applyYawPitch();
                } else if (this.animState && this.animState.mode === 'orbit') {
                    // Auto-orbit: OrbitControls rotates - track where it put us.
                    this.syncYawPitch();
                }
                // Tour mode: applyPoseLerp drives position+target, controls.update sets
                // quaternion via lookAt, no intervention needed.

                renderer.render(scene, camera);
            });

            // Keep the drawing buffer in sync with the element size.
            this.resizeObserver = new ResizeObserver(() => this.resizeCanvasToDisplaySize());
            this.resizeObserver.observe(canvas);
        },

        resizeCanvasToDisplaySize: function () {
            const renderer = this.renderer;
            const camera = this.camera;
            if (!renderer || !camera) return;
            const canvas = renderer.domElement;
            const width = canvas.clientWidth;
            const height = canvas.clientHeight;
            if (width === 0 || height === 0) return;
            if (canvas.width !== width || canvas.height !== height) {
                renderer.setSize(width, height, false);
                camera.aspect = width / height;
                camera.updateProjectionMatrix();
            }
        },

        // Orient the splat: 3DGS scenes are typically authored Y-down relative to three.js,
        // so a 180-degree rotation about X presents them right-side up. Toggleable for scenes
        // that are already upright.
        applyOrientation: function () {
            const mesh = this.splatMesh;
            if (!mesh) return;
            if (this.flipped) {
                // Quaternion (x=1, y=0, z=0, w=0) = 180 degrees about the X axis.
                mesh.quaternion.set(1, 0, 0, 0);
            } else {
                mesh.quaternion.set(0, 0, 0, 1);
            }
        },

        updatePointScale: function () {
            const mesh = this.splatMesh;
            if (!mesh) return;
            // The mesh is kept at unit scale (camera-based framing), so point size maps directly
            // to the mesh scale. Spark averages x/y/z into a uniform splat-size multiplier.
            mesh.scale.setScalar(this.pointScale);
        },

        // Position the camera so the whole splat fits comfortably in view.
        //
        // We frame by moving the CAMERA in world space rather than scaling the mesh: a paged
        // .rad streams its splats into Spark's shared pool, where a per-mesh scale does not apply
        // cleanly, so scaling would leave the scene invisible. Keeping the mesh at unit scale and
        // positioning the camera works identically for the plain .spz and the paged .rad paths.
        frameCamera: function () {
            const THREE = this.three;
            const mesh = this.splatMesh;
            const camera = this.camera;
            const controls = this.controls;
            if (!THREE || !mesh || !camera) return false;

            // Prefer the build-time bounds sidecar (deterministic, available immediately and the
            // only reliable source for a paged .rad). Otherwise fall back to the mesh's resident
            // bounds, which only become valid for a plain .spz once it is fully loaded.
            let box = null;
            let haveRealBox = false;
            if (this.bounds && this.bounds.min && this.bounds.max) {
                box = new THREE.Box3(
                    new THREE.Vector3(this.bounds.min[0], this.bounds.min[1], this.bounds.min[2]),
                    new THREE.Vector3(this.bounds.max[0], this.bounds.max[1], this.bounds.max[2])
                );
                haveRealBox = !box.isEmpty();
            }
            if (!haveRealBox) {
                box = mesh.getBoundingBox ? mesh.getBoundingBox(true) : null;
                haveRealBox = !!box && !box.isEmpty();
            }
            if (!haveRealBox) {
                box = new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
            }

            const size = new THREE.Vector3();
            const localCenter = new THREE.Vector3();
            box.getSize(size);
            box.getCenter(localCenter);

            // The bounds are in the splat's local space; the mesh may be reoriented (180deg flip),
            // so transform the center into world space by the mesh's current rotation. The mesh
            // stays at unit scale and origin position.
            mesh.scale.setScalar(this.pointScale);
            mesh.position.set(0, 0, 0);
            const center = localCenter.clone().applyQuaternion(mesh.quaternion);

            // Scene scale drives fly speed and the fallback target distance for presets.
            this.boundsDiagonal = Math.max(size.length(), 1e-3);

            // Distance so the bounding sphere fits the vertical field of view. We deliberately
            // use a tight margin (< 1) so the initial/reset view sits close to - almost inside -
            // the model, which reads as immersive rather than a distant dot in space.
            const radius = 0.5 * Math.max(size.x, size.y, size.z) || 1;
            const fov = (camera.fov * Math.PI) / 180;
            const dist = (radius / Math.sin(fov / 2)) * 0.6;

            // Keep near/far sensible for the (possibly large) local coordinate range. A small
            // near plane lets splats render even when the camera flies in among them.
            camera.near = Math.max(this.boundsDiagonal / 5000, 0.001);
            camera.far = dist + this.boundsDiagonal * 10;
            camera.updateProjectionMatrix();

            camera.position.set(center.x, center.y, center.z + dist);
            camera.lookAt(center);
            if (controls) {
                controls.target.copy(center);
                controls.update();
            }

            this.lookDist = Math.max(dist, 0.01);
            this.syncYawPitch();

            this.initialCameraPos = camera.position.clone();
            this.initialTarget = center.clone();
            // Report whether we framed against a real (non-empty) bounding box. A paged .rad
            // returns an empty box until its first chunks are resident, so callers retry.
            return haveRealBox;
        },

        // Frames the camera as soon as the splat's bounding box is known. Plain .spz scenes
        // frame on the first call; paged .rad scenes return an empty box until the first LOD
        // chunks stream in, so we retry on a short timer until a real box is available.
        frameCameraWhenReady: function () {
            if (this.frameTimer) {
                clearTimeout(this.frameTimer);
                this.frameTimer = null;
            }
            const tryFrame = (attempt) => {
                if (!this.splatMesh) return;
                if (this.frameCamera()) return; // framed against a real box
                if (attempt >= 40) return;      // ~10s; keep the provisional framing
                this.frameTimer = setTimeout(() => tryFrame(attempt + 1), 250);
            };
            tryFrame(0);
        },

        // ------------------------------------------------------------------
        // Immersive (fly) navigation
        // ------------------------------------------------------------------

        // Sync the internal yaw/pitch euler angles from the camera's current quaternion.
        // Must be called after any external change to camera orientation so the next drag
        // continues from the correct angles rather than snapping to stale values.
        syncYawPitch: function () {
            const THREE = this.three;
            if (!THREE || !this.camera) return;
            const eu = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
            this.yaw = eu.y;
            this.pitch = eu.x;
        },

        // Apply the stored yaw/pitch to the camera quaternion and keep controls.target
        // a fixed lookDist ahead in the look direction.
        // Called every frame after controls.update() to counteract its lookAt() call.
        applyYawPitch: function () {
            const THREE = this.three;
            if (!THREE || !this.camera || !this.controls) return;
            this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
            this.controls.target.copy(this.camera.position).addScaledVector(forward, this.lookDist);
        },

        // FPS click-drag: left mouse button rotates the camera in place (yaw/pitch),
        // like a first-person shooter. No pointer lock needed.
        onCanvasMouseDown: function (e) {
            if (e.button !== 0) return;
            // Don't capture the drag when a dialog is open (user clicks its controls).
            if (this.showSettings || this.showCameraManager) return;
            this.mouseDragging = true;
            this.mouseDragX = e.clientX;
            this.mouseDragY = e.clientY;
            // Resync yaw/pitch and lookDist from the current camera state. The tour or
            // OrbitControls pan/dolly may have moved things since the last drag.
            this.syncYawPitch();
            if (this.camera && this.controls) {
                this.lookDist = Math.max(
                    this.camera.position.distanceTo(this.controls.target), 0.01);
            }
            this.onUserInteract();
        },

        onCanvasMouseMove: function (e) {
            if (!this.mouseDragging) return;
            const dx = e.clientX - this.mouseDragX;
            const dy = e.clientY - this.mouseDragY;
            this.mouseDragX = e.clientX;
            this.mouseDragY = e.clientY;
            this.yaw -= dx * 0.003;
            this.pitch -= dy * 0.003;
            this.pitch = Math.max(-Math.PI * 0.48, Math.min(Math.PI * 0.48, this.pitch));
            this.applyYawPitch();
        },

        onCanvasMouseUp: function () {
            this.mouseDragging = false;
        },

        // Translate the camera AND its orbit target together so the look direction is preserved
        // while flying. Movement accelerates smoothly from rest up to top speed, then coasts to
        // a stop when keys are released, using exponential smoothing (frame-rate independent).
        // Returns true when the camera is moving (key held OR coasting to a stop).
        updateFly: function (dt) {
            if (!this.camera || !this.controls || dt <= 0) return false;
            const THREE = this.three;
            const camera = this.camera;
            const controls = this.controls;

            // Lazy init: THREE is not loaded at created() time.
            if (!this.flyVelocity) this.flyVelocity = new THREE.Vector3();

            const keys = this.activeKeys;
            const anyKey = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE'].some(k => keys.has(k));

            if (anyKey) {
                const fast = keys.has('ShiftLeft') || keys.has('ShiftRight') || keys.has('Shift');
                // Top speed scales with scene size so it feels consistent across models.
                const maxSpeed = this.boundsDiagonal * (fast ? 0.35 : 0.10);

                const forward = new THREE.Vector3();
                camera.getWorldDirection(forward);
                const worldUp = new THREE.Vector3(0, 1, 0);
                const right = new THREE.Vector3().crossVectors(forward, worldUp);
                if (right.lengthSq() < 1e-8) right.set(1, 0, 0); // looking straight up/down
                right.normalize();

                const targetVel = new THREE.Vector3();
                if (keys.has('KeyW')) targetVel.add(forward);
                if (keys.has('KeyS')) targetVel.addScaledVector(forward, -1);
                if (keys.has('KeyD')) targetVel.add(right);
                if (keys.has('KeyA')) targetVel.addScaledVector(right, -1);
                if (keys.has('KeyE')) targetVel.add(worldUp);
                if (keys.has('KeyQ')) targetVel.addScaledVector(worldUp, -1);
                if (targetVel.lengthSq() > 0) targetVel.normalize().multiplyScalar(maxSpeed);

                // Exponential ramp toward target velocity.
                // factor=4 -> reaches ~95% of max speed in ~0.37 s.
                this.flyVelocity.lerp(targetVel, 1 - Math.exp(-4 * dt));
            } else {
                // No key held: exponential coast to zero.
                // factor=14 -> drops to ~5% in ~0.21 s.
                this.flyVelocity.multiplyScalar(Math.exp(-14 * dt));
            }

            const spd = this.flyVelocity.length();
            // Stop threshold: 0.05% of scene diagonal per second feels imperceptible.
            if (spd < this.boundsDiagonal * 0.0005) {
                this.flyVelocity.set(0, 0, 0);
                return false; // fully stopped: let animation (tour/orbit) take over if active
            }

            const delta = this.flyVelocity.clone().multiplyScalar(dt);
            camera.position.add(delta);
            controls.target.add(delta);
            return true;
        },

        onKeyDown: function (e) {
            if (!this.loaded) return;
            // Don't hijack typing in form fields (e.g. the camera name input).
            const t = e.target;
            const tag = t && t.tagName ? t.tagName.toLowerCase() : '';
            if (tag === 'input' || tag === 'textarea' || (t && t.isContentEditable)) return;
            if (e.ctrlKey || e.metaKey || e.altKey) return;

            if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE'].includes(e.code)) {
                this.activeKeys.add(e.code);
                this.onUserInteract();
                e.preventDefault();
                return;
            }
            if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
                this.activeKeys.add(e.code);
                return;
            }
            // Number keys 0-9 jump to the matching preset.
            if (/^Digit[0-9]$/.test(e.code)) {
                const idx = parseInt(e.code.slice(5), 10);
                if (idx < this.cameras.length) { this.setCamera(idx); e.preventDefault(); }
                return;
            }
            // "-"/"+" cycle through presets; "P" resumes the default presentation.
            if (e.key === '-' || e.key === '_') { this.prevCamera(); e.preventDefault(); return; }
            if (e.key === '+' || e.key === '=') { this.nextCamera(); e.preventDefault(); return; }
            if (e.key === 'p' || e.key === 'P') { this.startDefaultAnimation(); e.preventDefault(); return; }
        },

        onKeyUp: function (e) {
            this.activeKeys.delete(e.code);
        },

        // Any explicit navigation cancels the running presentation and deselects the preset.
        onUserInteract: function () {
            this.stopAnimation();
            if (this.activeCameraIndex !== null) this.activeCameraIndex = null;
        },

        // Press-and-hold handlers for the on-screen overlay buttons (mouse + touch).
        pressDir: function (code, ev) {
            if (ev && ev.pointerId !== undefined && ev.currentTarget && ev.currentTarget.setPointerCapture) {
                try { ev.currentTarget.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
            }
            this.activeKeys.add(code);
            this.onUserInteract();
        },

        releaseDir: function (code) {
            this.activeKeys.delete(code);
        },

        // ------------------------------------------------------------------
        // Camera presets (loaded from / saved to <basename>_cameras.json)
        // ------------------------------------------------------------------

        loadCameras: async function () {
            this.cameras = [];
            this.activeCameraIndex = null;
            this.camerasDirty = false;
            try {
                const base = this.entry.path.replace(/\.[^./\\]+$/, '');
                this.camerasPath = `${base}_cameras.json`;
                const text = await this.dataset.getFileContents(this.camerasPath);
                const data = JSON.parse(text);
                const list = Array.isArray(data) ? data
                    : (data && Array.isArray(data.cameras) ? data.cameras : []);
                this.cameras = list.map((c, i) => this.normalizeCamera(c, i)).filter(Boolean);
            } catch (e) {
                // A missing sidecar (404) is the common case: start with no presets.
                this.cameras = [];
            }
        },

        // Validate and coerce a raw entry into the canonical native (three.js) camera shape.
        normalizeCamera: function (c, i) {
            if (!c || !Array.isArray(c.position) || c.position.length < 3) return null;
            const q = (Array.isArray(c.quaternion) && c.quaternion.length === 4) ? c.quaternion : [0, 0, 0, 1];
            const t = (Array.isArray(c.target) && c.target.length === 3) ? c.target : null;
            return {
                id: c.id !== undefined ? c.id : i,
                name: c.name || `Camera ${i + 1}`,
                position: [Number(c.position[0]), Number(c.position[1]), Number(c.position[2])],
                quaternion: [Number(q[0]), Number(q[1]), Number(q[2]), Number(q[3])],
                fov: typeof c.fov === 'number' ? c.fov : 60,
                target: t ? [Number(t[0]), Number(t[1]), Number(t[2])] : null
            };
        },

        // Snapshot of the live camera in the canonical preset shape.
        buildCameraFromCurrent: function () {
            const p = this.camera.position;
            const q = this.camera.quaternion;
            const t = this.controls.target;
            return {
                id: Date.now() + Math.floor(Math.random() * 1000),
                name: `Camera ${this.cameras.length + 1}`,
                position: [p.x, p.y, p.z],
                quaternion: [q.x, q.y, q.z, q.w],
                fov: this.camera.fov,
                target: [t.x, t.y, t.z]
            };
        },

        // World-space pose used by the tour interpolation and by setCamera.
        cameraPose: function (c) {
            const THREE = this.three;
            const position = new THREE.Vector3(c.position[0], c.position[1], c.position[2]);
            let target;
            if (c.target) {
                target = new THREE.Vector3(c.target[0], c.target[1], c.target[2]);
            } else {
                const q = new THREE.Quaternion(c.quaternion[0], c.quaternion[1], c.quaternion[2], c.quaternion[3]);
                const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
                target = position.clone().addScaledVector(dir, this.boundsDiagonal * 0.5 || 1);
            }
            return { position, target, fov: typeof c.fov === 'number' ? c.fov : 60 };
        },

        capturePose: function () {
            return {
                position: this.camera.position.clone(),
                target: this.controls.target.clone(),
                fov: this.camera.fov
            };
        },

        applyPose: function (pose) {
            this.camera.position.copy(pose.position);
            if (typeof pose.fov === 'number' && Math.abs(this.camera.fov - pose.fov) > 1e-3) {
                this.camera.fov = pose.fov;
                this.camera.updateProjectionMatrix();
            }
            this.controls.target.copy(pose.target);
        },

        applyPoseLerp: function (from, to, e) {
            const pos = from.position.clone().lerp(to.position, e);
            const tgt = from.target.clone().lerp(to.target, e);
            const fov = from.fov + (to.fov - from.fov) * e;
            this.camera.position.copy(pos);
            if (Math.abs(this.camera.fov - fov) > 1e-3) {
                this.camera.fov = fov;
                this.camera.updateProjectionMatrix();
            }
            this.controls.target.copy(tgt);
        },

        setCamera: function (index) {
            const c = this.cameras[index];
            if (!c || !this.camera || !this.controls) return;
            this.stopAnimation();
            this.applyPose(this.cameraPose(c));
            this.controls.update();
            this.activeCameraIndex = index;
            this.syncYawPitch();
        },

        nextCamera: function () {
            if (!this.cameras.length) return;
            const cur = this.activeCameraIndex === null ? -1 : this.activeCameraIndex;
            this.setCamera((cur + 1) % this.cameras.length);
        },

        prevCamera: function () {
            if (!this.cameras.length) return;
            const cur = this.activeCameraIndex === null ? 0 : this.activeCameraIndex;
            this.setCamera((cur + this.cameras.length - 1) % this.cameras.length);
        },

        // Adds the current view as a new preset (kept in memory until saved).
        addCurrentCamera: function () {
            if (!this.camera || !this.controls) return;
            this.cameras.push(this.buildCameraFromCurrent());
            this.camerasDirty = true;
            this.activeCameraIndex = this.cameras.length - 1;
        },

        // Settings shortcut: capture the current view and persist immediately.
        saveCurrentView: function () {
            this.addCurrentCamera();
            this.saveCameras();
        },

        updateCameraToCurrent: function (index) {
            const c = this.cameras[index];
            if (!c || !this.camera || !this.controls) return;
            const cur = this.buildCameraFromCurrent();
            c.position = cur.position;
            c.quaternion = cur.quaternion;
            c.fov = cur.fov;
            c.target = cur.target;
            this.camerasDirty = true;
            this.activeCameraIndex = index;
        },

        deleteCamera: function (index) {
            if (index < 0 || index >= this.cameras.length) return;
            this.cameras.splice(index, 1);
            this.camerasDirty = true;
            if (this.activeCameraIndex === index) this.activeCameraIndex = null;
            else if (this.activeCameraIndex !== null && this.activeCameraIndex > index) this.activeCameraIndex--;
        },

        moveCamera: function (payload) {
            const index = payload.index;
            const dest = index + payload.dir;
            if (index < 0 || index >= this.cameras.length || dest < 0 || dest >= this.cameras.length) return;
            const arr = this.cameras;
            const moved = arr.splice(index, 1)[0];
            arr.splice(dest, 0, moved);
            this.camerasDirty = true;
            if (this.activeCameraIndex === index) this.activeCameraIndex = dest;
            else if (this.activeCameraIndex === dest) this.activeCameraIndex = index;
        },

        renameCamera: function (payload) {
            const c = this.cameras[payload.index];
            if (!c) return;
            c.name = payload.name;
            this.camerasDirty = true;
        },

        saveCameras: async function () {
            if (!this.canWrite) {
                this.error = "You don't have permission to save camera views in this dataset.";
                return;
            }
            if (!this.camerasPath) return;
            try {
                const payload = {
                    version: 1,
                    cameras: this.cameras.map(c => ({
                        id: c.id,
                        name: c.name,
                        position: c.position,
                        quaternion: c.quaternion,
                        fov: c.fov,
                        target: c.target
                    }))
                };
                await this.dataset.writeObj(this.camerasPath, JSON.stringify(payload, null, 2));
                this.camerasDirty = false;
            } catch (e) {
                this.error = `Failed to save camera views: ${e.message}`;
            }
        },

        // ------------------------------------------------------------------
        // Default presentation: tour the presets, or slow auto-orbit when none
        // ------------------------------------------------------------------

        startDefaultAnimation: function () {
            if (!this.camera || !this.controls) return;
            // Reset any residual fly velocity so it doesn't block the tour on the first frame.
            if (this.flyVelocity) this.flyVelocity.set(0, 0, 0);
            this.activeKeys.clear();
            this.activeCameraIndex = null;
            if (this.cameras.length >= 1) {
                this.controls.autoRotate = false;
                this.animState = {
                    mode: 'tour',
                    target: 0,
                    phase: 'move',
                    elapsed: 0,
                    moveDur: 2.5,
                    dwellDur: 2.0,
                    from: this.capturePose(),
                    to: this.cameraPose(this.cameras[0])
                };
            } else {
                this.animState = { mode: 'orbit' };
                this.controls.autoRotate = true;
                this.controls.autoRotateSpeed = 0.2;
            }
            this.animating = true;
        },

        stopAnimation: function () {
            if (this.controls) this.controls.autoRotate = false;
            this.animating = false;
            this.animState = null;
            // Resync yaw/pitch so FPS drag continues from the correct camera angle.
            this.syncYawPitch();
        },

        updateDefaultAnimation: function (dt) {
            const st = this.animState;
            if (!st || st.mode !== 'tour') return; // orbit is handled by controls.autoRotate

            st.elapsed += dt;
            if (st.phase === 'move') {
                const u = st.moveDur > 0 ? Math.min(st.elapsed / st.moveDur, 1) : 1;
                const e = u * u * (3 - 2 * u); // smoothstep ease in/out
                this.applyPoseLerp(st.from, st.to, e);
                if (u >= 1) {
                    st.phase = 'dwell';
                    st.elapsed = 0;
                    this.activeCameraIndex = st.target; // show which preset we paused at
                }
            } else {
                if (st.elapsed >= st.dwellDur) {
                    const next = (st.target + 1) % this.cameras.length;
                    st.from = this.capturePose();
                    st.to = this.cameraPose(this.cameras[next]);
                    st.target = next;
                    st.phase = 'move';
                    st.elapsed = 0;
                    this.activeCameraIndex = null;
                }
            }
        },

        resetView: function () {
            this.stopAnimation();
            this.activeKeys.clear();
            if (this.cameras.length) { this.setCamera(0); return; }
            const camera = this.camera;
            const controls = this.controls;
            if (camera && this.initialCameraPos) {
                camera.position.copy(this.initialCameraPos);
            }
            if (controls) {
                controls.target.copy(this.initialTarget || new this.three.Vector3(0, 0, 0));
                controls.update();
            }
            this.activeCameraIndex = null;
        },

        toggleSettings: function () {
            this.showSettings = !this.showSettings;
        },

        toggleCameraManager: function () {
            this.showCameraManager = !this.showCameraManager;
        },

        disposeViewer: function () {
            // Stop Spark's render/streaming loop before tearing down WebGL resources.
            if (this.renderer) this.renderer.setAnimationLoop(null);
            if (this.rafId) cancelAnimationFrame(this.rafId);
            this.rafId = null;

            // Stop any running presentation / pending fly input.
            this.animating = false;
            this.animState = null;
            if (this.activeKeys) this.activeKeys.clear();

            if (this.frameTimer) {
                clearTimeout(this.frameTimer);
                this.frameTimer = null;
            }

            if (this.resizeObserver) {
                this.resizeObserver.disconnect();
                this.resizeObserver = null;
            }
            // Remove FPS drag listeners from the canvas before tearing down the renderer.
            this.mouseDragging = false;
            if (this.renderer) {
                const cvs = this.renderer.domElement;
                cvs.removeEventListener('mousedown', this.onCanvasMouseDownBound);
                cvs.removeEventListener('mousemove', this.onCanvasMouseMoveBound);
                cvs.removeEventListener('mouseup', this.onCanvasMouseUpBound);
                cvs.removeEventListener('mouseleave', this.onCanvasMouseUpBound);
            }
            if (this.controls) {
                this.controls.removeEventListener('start', this.onUserInteractBound);
                if (this.controls.dispose) this.controls.dispose();
            }
            if (this.splatMesh && this.splatMesh.dispose) this.splatMesh.dispose();
            if (this.renderer) {
                this.renderer.dispose();
                this.renderer.forceContextLoss && this.renderer.forceContextLoss();
            }
            this.controls = null;
            this.splatMesh = null;
            this.spark = null;
            this.scene = null;
            this.camera = null;
            this.renderer = null;
            this.three = null;
        }
    }
}
</script>

<style scoped>
#splat {
    background: var(--ddb-viewer-bg);
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

#splat .ui.message {
    margin: 0.5rem;
}

#splat .container-wrapper {
    display: flex;
    width: 100%;
    height: 100%;
    position: relative;
}

#splat .container-wrapper canvas {
    display: flex;
    width: 100%;
    height: 100%;
}

#splat .loading {
    color: var(--ddb-text-on-dark);
    font-size: var(--ddb-font-size-base);
    margin: 0.5rem;
    text-align: center;
}

#splat .top-right-stack {
    position: absolute;
    top: var(--ddb-spacing-md);
    right: var(--ddb-spacing-md);
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.35rem;
    pointer-events: none;
}

#splat .crs-badge,
#splat .camera-hud {
    background: rgba(0, 0, 0, 0.55);
    color: var(--ddb-text-on-dark);
    padding: 0.25rem 0.6rem;
    border-radius: var(--ddb-border-radius, 4px);
    font-size: var(--ddb-font-size-sm, 0.8rem);
    white-space: nowrap;
}

#splat .camera-hud {
    background: rgba(20, 60, 110, 0.7);
}

#splat .crs-badge i,
#splat .camera-hud i {
    margin-right: 0.35rem;
}

#splat .streaming-badge {
    position: absolute;
    top: var(--ddb-spacing-md);
    left: var(--ddb-spacing-md);
    background: rgba(0, 0, 0, 0.55);
    color: var(--ddb-text-on-dark);
    padding: 0.25rem 0.6rem;
    border-radius: var(--ddb-border-radius, 4px);
    font-size: var(--ddb-font-size-sm, 0.8rem);
}

#splat .streaming-badge i {
    margin-right: 0.35rem;
}

#splat .btn-stack {
    position: absolute;
    bottom: var(--ddb-spacing-md);
    left: var(--ddb-spacing-md);
    display: flex;
    gap: 0.4rem;
}

#splat .btn-overlay {
    width: 2.25rem;
    height: 2.25rem;
    border: none;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.55);
    color: var(--ddb-text-on-dark);
    cursor: pointer;
}

#splat .btn-overlay:hover {
    background: rgba(0, 0, 0, 0.75);
}

/* Immersive navigation recap / touch pad (bottom-right). */
#splat .nav-controls {
    position: absolute;
    bottom: var(--ddb-spacing-md);
    right: var(--ddb-spacing-md);
    user-select: none;
    touch-action: none;
}

#splat .nav-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.3rem;
}

#splat .nav-key {
    position: relative;
    width: 2.6rem;
    height: 2.6rem;
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: var(--ddb-border-radius, 6px);
    background: rgba(0, 0, 0, 0.4);
    color: var(--ddb-text-on-dark);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1rem;
    transition: background 0.1s ease;
}

#splat .nav-key:hover {
    background: rgba(0, 0, 0, 0.6);
}

#splat .nav-key:active {
    background: rgba(40, 110, 190, 0.8);
}

#splat .nav-key .letter {
    position: absolute;
    bottom: 0.1rem;
    right: 0.25rem;
    font-size: 0.6rem;
    opacity: 0.8;
}

/* Larger, more reachable buttons on touch devices. */
#splat .nav-controls.touch .nav-key {
    width: 3.4rem;
    height: 3.4rem;
    background: rgba(0, 0, 0, 0.5);
    font-size: 1.2rem;
}

#splat .settings-actions {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0.15rem;
    margin-top: var(--ddb-spacing-sm, 0.5rem);
}

#splat .settings-content .form-group {
    margin-bottom: var(--ddb-spacing-md);
}

#splat .settings-content .checkbox-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
}

#splat .settings-content small {
    display: block;
    color: var(--ddb-text-muted, #999);
    margin-top: 0.15rem;
}

#splat .w-100 {
    width: 100%;
}
</style>
