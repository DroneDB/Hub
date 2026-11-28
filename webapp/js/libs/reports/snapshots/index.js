// @ts-check
/**
 * The snapshot renderers of a report. The live page and the PDF both ask them for an image of a block of the report
 * model, so a figure is drawn by one piece of code.
 *
 *   renderMapSnapshot(block, { dataset, width, height, signal })  -> { image: Blob, width, height, note }
 *   renderProfileChart(block, { dataset, width, height, signal }) -> { image: Blob | null, width, height, note }
 *   capture3dImageUrl(block, dataset)                             -> the address of the stored capture, or null
 *   createRenderQueue({ concurrency })                            -> { run(task, { signal }) }
 */
export { renderMapSnapshot, BASEMAP_NOT_SHOWN, SNAPSHOT_SIZE } from '@/libs/reports/snapshots/mapSnapshot';
export { renderProfileChart, PROFILE_SIZE } from '@/libs/reports/snapshots/profileChart';
export { capture3dImageUrl, capturePath } from '@/libs/reports/snapshots/capture3d';
export { createRenderQueue, sharedRenderQueue, RENDER_CONCURRENCY } from '@/libs/reports/snapshots/renderQueue';
