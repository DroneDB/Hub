// @ts-check
/**
 * The component that draws each type of block of the report model (libs/reports/reportSections). One component per
 * type: a renderer that comes later (snapshots, charts, captures, QR codes) replaces the component of its type, and
 * neither the page nor the model changes.
 */
import HeadingBlock from './HeadingBlock.vue';
import KeyValueBlock from './KeyValueBlock.vue';
import TableBlock from './TableBlock.vue';
import MarkdownBlock from './MarkdownBlock.vue';
import NoteBlock from './NoteBlock.vue';
import SignOffBlock from './SignOffBlock.vue';
import SummaryStatsBlock from './SummaryStatsBlock.vue';
import PhotoGridBlock from './PhotoGridBlock.vue';
import MapSnapshotBlock from './MapSnapshotBlock.vue';
import ChartBlock from './ChartBlock.vue';
import Capture3dBlock from './Capture3dBlock.vue';
import QrBlock from './QrBlock.vue';

export const BLOCK_COMPONENTS = Object.freeze({
    heading: HeadingBlock,
    keyValue: KeyValueBlock,
    table: TableBlock,
    markdown: MarkdownBlock,
    note: NoteBlock,
    signOff: SignOffBlock,
    summaryStats: SummaryStatsBlock,
    photoGrid: PhotoGridBlock,
    mapSnapshot: MapSnapshotBlock,
    chart: ChartBlock,
    capture3d: Capture3dBlock,
    qr: QrBlock
});
