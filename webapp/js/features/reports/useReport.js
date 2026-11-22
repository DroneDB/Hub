// @ts-check
/**
 * useReport - the live report: reads what the page shows each time it opens (the report definition, the measurement
 * files it names, the organization's templates and schema, the cover view) and builds the report model from them. A
 * report holds no numbers, so a status changed since it was saved shows as it is now.
 *
 * The page state is one of: loading, `loadError` (the dataset or the list did not answer: not found, no access, sign
 * in, busy: ViewerShell's page states), `missing` (the report is not there), `unreadable` (it is there, and cannot be
 * shown: its error), or ready (`model`).
 *
 *   const report = useReport({ org, ds, uid });
 *   await report.loaded;
 */
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue';
import reg from '@/libs/api/sharedRegistry';
import { permissionsOf } from '@/libs/datasetPermissions';
import { getPref, PREF, PREF_DEFAULTS } from '@/libs/preferences';
import { instanceLogoUrl } from '@/libs/hubBranding';
import { absoluteUrl, itemAnchor, reportUrl } from '@/libs/views/viewLinks';
import { listViews, usableView } from '@/libs/views/viewStore';
import { listReports, NEWER_REPORT_TEXT } from '@/libs/reports/reportStore';
import { datasetReportSettings, datasetTemplateLogoUrl } from '@/libs/reports/reportSettings';
import { loadReportSources } from '@/libs/reports/reportSources';
import { buildReportModel } from '@/libs/reports/reportModel';
import { findOwnerRoute, itemViewerUrls, viewMeasurementFile } from '@/libs/reports/reportViewerLinks';
import { useDatasetSessionStore } from '@/stores/datasetSession';
import { pathutils } from 'ddb';

/** The most layers whose value info is asked for (a view has at most this many layers). */
const MAX_LAYER_INFO = 8;

/** @param {unknown} e */
const messageOf = e => (e instanceof Error && e.message ? e.message : String(e));

/**
 * What the model needs to know of the layers of the cover view: what libddb says of each (the elevation test, the
 * profile charts) and its name. A layer that cannot be read has none.
 * @param {any} dataset @param {string[]} paths
 * @returns {Promise<Record<string, Record<string, any>>>}
 */
async function readLayerInfo(dataset, paths) {
    const info = /** @type {Record<string, Record<string, any>>} */ ({});
    await Promise.all(paths.slice(0, MAX_LAYER_INFO).map(async path => {
        info[path] = { name: pathutils.basename(path) };
        try {
            Object.assign(info[path], await dataset.getRasterValueInfo(path));
        } catch (e) {
            console.warn(`The raster ${path} could not be described:`, e);
        }
    }));
    return info;
}

/**
 * The cover view as the model wants it: the state, or `deleted`. A saved view that is there and cannot be drawn (it
 * cannot be read, or is of a later version) is a deleted one, as the editor has it (usableView).
 * @param {any} dataset @param {import('@/libs/reports/reportDefinition').ReportCover} cover
 * @returns {Promise<{ state: import('@/libs/views/viewState').ViewState | null, deleted: boolean }>}
 */
async function readCover(dataset, cover) {
    if ('viewState' in cover) return { state: cover.viewState, deleted: false };
    const view = usableView(await listViews(dataset, { fresh: true }), cover.viewId);
    if (!view) return { state: null, deleted: true };
    return { state: /** @type {import('@/libs/views/viewState').ViewState} */ (view.data), deleted: false };
}

/**
 * @param {object} ctx
 * @param {string} ctx.org @param {string} ctx.ds @param {string} ctx.uid  the route's
 */
export function useReport({ org, ds, uid }) {
    const dataset = reg.Organization(org).Dataset(ds);
    const session = useDatasetSessionStore();

    const loading = ref(true);
    /** @type {import('vue').ShallowRef<unknown>} */
    const loadError = shallowRef(null);
    const missing = ref(false);
    const unreadable = ref('');
    const canWrite = ref(false);
    /** @type {import('vue').ShallowRef<import('@/libs/metaList/metaListStore').MetaEntry | null>} */
    const entry = shallowRef(null);
    /** @type {import('vue').ShallowRef<ReturnType<typeof buildReportModel> | null>} */
    const model = shallowRef(null);

    // The root entry names the dataset in the header's breadcrumb, as the viewers do; it goes with the page
    let sessionRoot = null;
    onBeforeUnmount(() => {
        if (sessionRoot && session.rootEntry === sessionRoot) session.setRootEntry(null);
    });

    /** The model from what was read. */
    async function build() {
        const definition = /** @type {import('@/libs/reports/reportDefinition').ReportDefinition} */ (/** @type {any} */ (entry.value).data);
        const cover = definition.cover ? await readCover(dataset, definition.cover) : { state: null, deleted: true };
        const layerPaths = cover.state ? cover.state.layers.map(l => l.path) : [];
        const [settings, sources, layerInfo, datasetName] = await Promise.all([
            datasetReportSettings(dataset),
            loadReportSources(dataset, definition.sources),
            readLayerInfo(dataset, layerPaths),
            reg.Organization(org).datasets({ slugs: [ds] }).then(/** @param {any} list */ list => (Array.isArray(list) ? list.find(d => d.slug === ds)?.name : null) || ds, () => ds)
        ]);

        // The map each other 2D source opens in: the cover's own file needs none
        const coverFile = viewMeasurementFile(cover.state);
        const others = [...new Set(sources.map(s => s.file))].filter(f => f !== coverFile);
        const routes = new Map(await Promise.all(others.map(async file => /** @type {const} */ ([file, await findOwnerRoute(dataset, file)]))));
        const viewerUrl = itemViewerUrls({ dataset: { org, ds }, cover: definition.cover, coverState: cover.state, ownerRoutes: routes });

        const pageUrl = absoluteUrl(reportUrl({ org, ds }, uid));
        model.value = buildReportModel({
            definition, sources, settings, coverView: cover, layerInfo, datasetName,
            units: getPref(PREF.MEASURE_UNIT, PREF_DEFAULTS[PREF.MEASURE_UNIT]) === 'imperial' ? 'imperial' : 'metric',
            currency: getPref(PREF.CURRENCY, PREF_DEFAULTS[PREF.CURRENCY]),
            brandingLogoUrl: instanceLogoUrl(),
            now: new Date(),
            links: {
                reportUrl: pageUrl,
                anchorUrl: item => `${pageUrl}${itemAnchor(item.id)}`,
                viewerUrl: item => viewerUrl(item),
                templateLogoUrl: template => datasetTemplateLogoUrl(dataset, template.id, template.logo)
            }
        });
    }

    async function load() {
        loading.value = true;
        loadError.value = null;
        missing.value = false;
        unreadable.value = '';
        try {
            const root = (await dataset.info())[0];
            canWrite.value = permissionsOf(root).canWrite;
            session.setRootEntry(root);
            sessionRoot = root;

            const { reports, unreadable: broken } = await listReports(dataset, { fresh: true });
            entry.value = reports.find(r => r.uid === uid) ?? null;
            if (!entry.value) {
                const damaged = broken.find(b => b.uid === uid);
                if (damaged) unreadable.value = `This report cannot be read: ${damaged.error}.`;
                else missing.value = true;
                return;
            }
            if (entry.value.newerVersion) {
                unreadable.value = NEWER_REPORT_TEXT;
                return;
            }
            await build();
        } catch (e) {
            console.error('Cannot open the report:', e);
            loadError.value = e;
        } finally {
            loading.value = false;
        }
    }

    const loaded = load();
    return {
        dataset, loading, loadError, missing, unreadable, canWrite, entry, model, loaded, reload: load,
        ready: computed(() => !!model.value && !loading.value),
        errorMessage: computed(() => (loadError.value ? messageOf(loadError.value) : ''))
    };
}
