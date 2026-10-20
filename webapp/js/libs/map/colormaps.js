// @ts-check
/**
 * The raster renderer's colormaps (DroneDB src/library/vegetation.cpp, initColormaps),
 * as evenly spaced stops: the picker swatches and the histogram bars draw from here, so
 * they match what the server paints. One table for RasterAnalysisControls,
 * PlantHealthPanel and HistogramChart (HQ-10: two copies disagreed with the server).
 */

/** @typedef {{ id: string, name: string, colors: string[], discrete?: boolean }} Colormap */

/** @type {Record<string, Omit<Colormap, 'id'>>} */
const TABLE = {
    rdylgn: { name: 'Red-Yellow-Green', colors: ['#d73027', '#fdae61', '#fee08b', '#a6d96a', '#1a9850'] },
    discrete_ndvi: { name: 'Contrast NDVI', colors: ['#8b0000', '#ff4500', '#ffd700', '#32cd32', '#006400'], discrete: true },
    spectral: { name: 'Spectral', colors: ['#9e0142', '#fdae61', '#ffffbf', '#66c2a5', '#5e4fa2'] },
    viridis: { name: 'Viridis', colors: ['#440154', '#3b528b', '#21908c', '#5dc963', '#fde725'] },
    plasma: { name: 'Plasma', colors: ['#0d0887', '#7e03a8', '#cc4778', '#f89540', '#f0f921'] },
    inferno: { name: 'Inferno', colors: ['#000004', '#57106e', '#bc3754', '#f98e09', '#fcffa4'] },
    magma: { name: 'Magma', colors: ['#000004', '#51127c', '#b73779', '#fc8961', '#fcfdbf'] },
    grayscale: { name: 'Grayscale', colors: ['#000000', '#ffffff'] },
    ironbow: { name: 'Ironbow', colors: ['#000000', '#570f6a', '#bd3754', '#f97808', '#ffe344', '#ffffff'] },
    rainbow: { name: 'Rainbow', colors: ['#96005a', '#0000c8', '#0096ff', '#00ff00', '#ffff00', '#ff6400', '#c80000'] },
    bugn: { name: 'Blue-Green', colors: ['#f7fcfd', '#b2e2e2', '#66c2a4', '#238b45', '#00441b'] },
    whitehot: { name: 'White Hot', colors: ['#000000', '#ffffff'] },
    blackhot: { name: 'Black Hot', colors: ['#ffffff', '#000000'] },
    arctic: { name: 'Arctic', colors: ['#000040', '#0064c8', '#64c8ff', '#c8f0ff', '#ffffff'] },
    lava: { name: 'Lava', colors: ['#000000', '#800000', '#ff5000', '#ffc800', '#ffffc8'] },
    terrain: { name: 'Terrain', colors: ['#333399', '#00b4b4', '#a0d979', '#ecd87a', '#a97443', '#ffffff'] },
    greys: { name: 'Greys', colors: ['#ffffff', '#000000'] }
};

/** Thermal rasters (RasterAnalysisControls) */
export const THERMAL_COLORMAPS = ['ironbow', 'whitehot', 'blackhot', 'arctic', 'lava', 'inferno', 'magma', 'plasma'];
/** Other single-band rasters (RasterAnalysisControls) */
export const GENERIC_COLORMAPS = ['viridis', 'terrain', 'magma', 'plasma', 'inferno', 'greys'];
/** Vegetation indices (PlantHealthPanel) */
export const INDEX_COLORMAPS = ['rdylgn', 'discrete_ndvi', 'spectral', 'viridis', 'plasma', 'inferno', 'magma',
    'grayscale', 'ironbow', 'rainbow', 'bugn', 'whitehot', 'blackhot', 'arctic', 'lava'];

/**
 * @param {string} id
 * @returns {Colormap} unknown ids get the name and no swatch
 */
export function colormap(id) {
    const c = TABLE[id];
    return c ? { id, ...c } : { id, name: id, colors: [] };
}

/** @param {string[]} ids */
export const colormapList = ids => ids.map(colormap);

/** @param {string} hex '#rrggbb' */
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

/**
 * The colour at `t` (0..1) along a colormap, as CSS rgb(); grayscale for an unknown id.
 * @param {string | null | undefined} id
 * @param {number} t
 */
export function colorAt(id, t) {
    const { colors, discrete } = TABLE[id || ''] || TABLE.grayscale;
    const x = Math.min(1, Math.max(0, t)) * (colors.length - 1);
    if (discrete) {
        const [r, g, b] = rgb(colors[Math.min(colors.length - 1, Math.floor(t * colors.length))]);
        return `rgb(${r},${g},${b})`;
    }
    const lo = Math.floor(x);
    const hi = Math.min(lo + 1, colors.length - 1);
    const f = x - lo;
    const [a, b] = [rgb(colors[lo]), rgb(colors[hi])];
    const [r, g, bl] = a.map((v, i) => Math.round(v + (b[i] - v) * f));
    return `rgb(${r},${g},${bl})`;
}
