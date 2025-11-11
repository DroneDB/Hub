<template>
    <div id="panorama">
        <TabViewLoader @loaded="handleLoad" titleSuffix="Panorama" loadingText="Loading viewer..." />

        <Message bindTo="error" noDismiss />

        <div class="viewer" ref="viewer">
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
            loaded: false
        };
    },
    mounted: function () {
    },

    methods: {

        handleLoad: async function () {
            try {
                // Quick type check
                if (this.entry.type !== ddb.entry.type.PANORAMA && this.entry.type !== ddb.entry.type.GEOPANORAMA)
                    throw new Error(`${this.entry.path} cannot be opened as a panorama`);

                this.loading = true;

                await loadResources("/potree/libs/three.js/build/three.min.js");
                await loadResources("/photosphereviewer/browser.min.js");
                await loadResources("/photosphereviewer/photo-sphere-viewer.min.css");
                await loadResources("/photosphereviewer/photo-sphere-viewer.min.js");

                await this.loadViewer();

            } catch (e) {
                this.error = e.message;
            } finally {
                this.loading = false;
            }
        },
        loadViewer: async function () {
            this.error = "";

            const panoUrl = this.dataset.downloadUrl(this.entry.path, { inline: true });
            const p = this.entry.properties;

            this.viewer = new PhotoSphereViewer.Viewer({
                container: this.$refs.viewer,
                panorama: panoUrl,
                loadingTxt: "Loading ...",
                useXmpData: false,
                canvasBackground: "#030A03",
                minFov: 1,
                defaultZoomLvl: 60,
                panoData: {
                    fullWidth: p.width,
                    fullHeight: p.height,
                    croppedWidth: p.croppedWidth,
                    croppedHeight: p.croppedHeight,
                    croppedX: p.croppedX,
                    croppedY: p.croppedY,
                    poseHeading: p.poseHeading,
                    posePitch: p.posePitch,
                    poseRoll: p.poseRoll
                }
            });
        },

        handleHistoryBack: function () {
            this.$router.push({ name: 'ViewDataset', params: { org: this.dataset.org, ds: this.dataset.ds } });
        },
    }
}
</script>

<style>
#panorama {
    .ui.message {
        margin: 8px;
    }

    background: #030A03;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;

    .loading {
        color: #fefefe;
        font-size: 120%;
        margin: 8px;
        text-align: center;

        .circle.notch {
            height: 20px;
            width: 22px;
        }
    }

    .viewer {
        position: relative;
        display: flex;
        width: 100%;
        height: 100%;

        .psv-loader {
            color: #fefefe;
        }

        .psv-container {
            background: #030A03;
        }
    }

    .psv-download-button {
        display: none;
    }
}
</style>