// @ts-check
/**
 * useViewerEntry - the file a viewer route shows: loads the entry named by the route
 * (/r/:org/:ds/view/:encodedPath/<viewer>), checks its type with one message, reads the
 * dataset permissions, selects the file in the session store and sets the page title.
 *
 *   setup() {
 *       return useViewerEntry({ types: [ddb.entry.type.MODEL], typeLabel: 'a 3D model', title: 'Model' });
 *   }
 *   async mounted() { if (await this.entryLoaded) this.startViewer(); }
 *
 * Returns refs, so they are reactive in templates and Options-API code alike: `entry`,
 * `dataset`, `ddbURI`, `canRead`, `canWrite`, `canDelete`, `loading`, `error` (the view's
 * one error, shown by ViewerShell) and `entryLoaded`, a promise of whether the entry
 * loaded and has an accepted type.
 */
import { ref, shallowRef } from 'vue';
import { useRoute } from 'vue-router';
import ddb from 'ddb';
import reg from '@/libs/api/sharedRegistry';
import { b64decode } from '@/libs/base64';
import { setTitle } from '@/libs/utils';
import { permissionsOf, NO_PERMISSIONS } from '@/libs/datasetPermissions';
import { useDatasetSessionStore } from '@/stores/datasetSession';

/**
 * @param {object} options
 * @param {string[]} [options.types]   accepted entry types (any when omitted)
 * @param {string} [options.typeLabel] "a 3D model": the error says the file "cannot be opened as <typeLabel>"
 * @param {string} options.title       page title suffix ("<file> - <title>")
 */
export function useViewerEntry({ types, typeLabel = 'this view', title }) {
    const route = useRoute();
    const entry = shallowRef(null);
    const dataset = shallowRef(null);
    const ddbURI = ref('');
    const canRead = ref(false);
    const canWrite = ref(false);
    const canDelete = ref(false);
    const loading = ref(true);
    const error = ref('');

    async function load() {
        const { org, ds: slug, encodedPath } = route.params;
        if (!encodedPath) throw new Error('Invalid uri');
        const ds = reg.Organization(String(org)).Dataset(String(slug));
        const path = b64decode(String(encodedPath));
        ddbURI.value = ds.remoteUri(path);
        const e = await ds.listOne(path);
        if (types && !types.includes(e.type)) throw new Error(`${e.path} cannot be opened as ${typeLabel}`);

        let permissions = { ...NO_PERMISSIONS };
        try {
            permissions = permissionsOf((await ds.info())[0]);
        } catch (permError) {
            console.warn('Could not load dataset permissions:', permError);
        }
        canRead.value = permissions.canRead;
        canWrite.value = permissions.canWrite;
        canDelete.value = permissions.canDelete;
        dataset.value = ds;
        entry.value = e;

        useDatasetSessionStore().setSelectedFiles([{ path: ddbURI.value }]);
        setTitle(`${ddb.pathutils.basename(e.path)} - ${title}`);
    }

    const entryLoaded = load().then(() => true, e => {
        error.value = e.message;
        return false;
    }).finally(() => { loading.value = false; });

    return { entry, dataset, ddbURI, canRead, canWrite, canDelete, loading, error, entryLoaded };
}
