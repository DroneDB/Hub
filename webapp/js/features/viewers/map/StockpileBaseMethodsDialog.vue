<template>
    <Window id="stockpile-base-methods" :visible="visible" title="Base plane methods" modal fixed-position
            width="560px" max-width="95vw" height="auto" close-button cancel-label="Close"
            @update:visible="$emit('update:visible', $event)">
        <div class="info-dialog-body">
            <p class="info-intro">
                The <b>base plane</b> is the reference surface used to compute
                cut and fill volumes inside the polygon. Pick the option that
                best matches the terrain around your pile.
            </p>
            <p class="info-intro" data-testid="stockpile-base-default">
                Until you pick one, a pile found with <b>Click map</b> is measured
                from the <b>Best-fit plane</b>: the detector finds the pile as what
                rises above the ground around it, so a pile on a slope is measured
                above the slope. A polygon you draw is measured from the
                <b>Lowest perimeter</b>. Picking a base measures the current pile
                again and is used for the next piles.
            </p>

            <div v-for="m in methods" :key="m.id" class="method-card">
                <h4><i :class="m.icon" /> {{ m.name }}</h4>
                <p class="method-line"><b>What it does:</b> {{ m.what }}</p>
                <p class="method-line"><b>When to use it:</b> {{ m.when }}</p>
                <p class="method-line"><b>Output:</b> {{ m.output }}</p>
            </div>

            <h4 class="params-title">Detection parameters</h4>
            <div class="param-card">
                <p><b>Search radius (m):</b> the distance, in meters, that the
                    detector explores around your click looking for the pile edges.
                    Increase it for large piles or when nothing is detected; decrease
                    it to constrain the search to a small area.</p>
                <p><b>Sensitivity (0 - 1):</b> how aggressively the edge detector
                    separates the pile from the surrounding ground. Higher values
                    find subtler piles but may include unrelated terrain; lower values
                    stay closer to clearly elevated areas.</p>
            </div>
        </div>

    </Window>
</template>

<script>
import Window from '@/components/HubWindow.vue';
import { BASE_METHOD, baseMethodName } from '@/libs/stockpileBase';

export default {
    name: 'StockpileBaseMethodsDialog',
    components: { Window },
    props: {
        visible: { type: Boolean, default: false }
    },
    emits: ['update:visible'],
    data() {
        return {
            methods: [
                {
                    id: BASE_METHOD.LOWEST_PERIMETER,
                    name: baseMethodName(BASE_METHOD.LOWEST_PERIMETER),
                    icon: 'fa-solid fa-arrow-down',
                    what: 'The base elevation is the lowest point along the polygon boundary. The whole pile sits above this floor.',
                    when: 'Isolated piles on uneven ground where the boundary touches the actual ground level at least at one point.',
                    output: 'Cut volume only. Fill volume is always 0 because no pixel is below the floor.'
                },
                {
                    id: BASE_METHOD.AVERAGE_PERIMETER,
                    name: baseMethodName(BASE_METHOD.AVERAGE_PERIMETER),
                    icon: 'fa-solid fa-equals',
                    what: 'The base is the mean elevation of the polygon boundary, treated as a flat horizontal plane.',
                    when: 'Surrounding terrain is roughly level. A balanced choice that tolerates small dips and bumps along the boundary.',
                    output: 'Both cut (above the plane) and fill (below the plane) volumes.'
                },
                {
                    id: BASE_METHOD.BEST_FIT,
                    name: baseMethodName(BASE_METHOD.BEST_FIT),
                    icon: 'fa-solid fa-ruler-combined',
                    what: 'Fits a tilted plane through the perimeter elevations using least squares.',
                    when: 'The ground around the pile slopes consistently in one direction.',
                    output: 'Both cut and fill volumes against the tilted plane.'
                },
                {
                    id: BASE_METHOD.FLAT,
                    name: baseMethodName(BASE_METHOD.FLAT),
                    icon: 'fa-solid fa-water',
                    what: 'Uses the absolute reference 0 m as the base plane.',
                    when: 'The raster is already a height-above-ground product (e.g. DSM minus DTM). Do not use on a regular DSM.',
                    output: 'Cut and fill volumes against absolute 0 m.'
                }
            ]
        };
    }
};
</script>

<style scoped>
.info-dialog-body {
    font-size: 0.9rem;
    line-height: 1.45;
    max-height: 60vh;
    overflow-y: auto;
}

.info-intro {
    margin: 0 0 1rem 0;
}

.method-card {
    border: 1px solid var(--p-content-border-color);
    border-radius: 0.4rem;
    padding: 0.6rem 0.8rem;
    margin-bottom: 0.6rem;
    background: rgba(255, 255, 255, 0.03);
}

.method-card h4 {
    margin: 0 0 0.3rem 0;
    font-size: 0.95rem;
}

.method-card h4 i {
    margin-right: 0.4rem;
    opacity: 0.75;
}

.method-line {
    margin: 0.2rem 0;
}

.params-title {
    margin: 1rem 0 0.4rem 0;
    font-size: 0.95rem;
}

.param-card {
    border: 1px solid var(--p-content-border-color);
    border-radius: 0.4rem;
    padding: 0.6rem 0.8rem;
    background: rgba(255, 255, 255, 0.03);
}

.param-card p {
    margin: 0.2rem 0;
}
</style>
