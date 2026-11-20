/**
 * The point size of a splat scene: every splat grows or shrinks about its own centre, so the
 * scene keeps its extent (framing, fly speed and where things are do not change). Spark has no
 * option for it, so it is an object modifier of the splat mesh (a dyno program run for every splat on
 * the GPU) that multiplies the splats' scales by one uniform factor.
 *
 *   const pointSize = createPointSize(Spark.dyno, 1.5);
 *   new Spark.SplatMesh({ ...options, objectModifier: pointSize.modifier });
 *   pointSize.set(2, mesh);      // later: a new factor, the mesh regenerates its splats
 */

/**
 * @param {any} dyno  Spark's `dyno` namespace
 * @param {number} [initial]
 */
export function createPointSize(dyno, initial = 1) {
    const { dynoFloat, dynoBlock, Gsplat, splitGsplat, combineGsplat, mul } = dyno;
    const factor = dynoFloat(initial);
    const modifier = dynoBlock({ gsplat: Gsplat }, { gsplat: Gsplat }, ({ gsplat }) => {
        const { scales } = splitGsplat(gsplat).outputs;
        return { gsplat: combineGsplat({ gsplat, scales: mul(scales, factor) }) };
    });
    return {
        modifier,
        get value() { return factor.value; },
        /**
         * Sets the factor; a mesh that exists already is told to run its splats through the program again.
         * @param {number} value
         * @param {{ updateVersion: () => void } | null} [mesh]
         */
        set(value, mesh = null) {
            factor.value = value;
            if (mesh) mesh.updateVersion();
        }
    };
}
