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
 * one error, shown by ViewerShell), `loadError` (the error the entry did not load with, for
 * ViewerShell's `load-error`: a missing file or dataset, no access, sign in, a link whose path
 * cannot be read give its page state) and `entryLoaded`, a promise of whether the entry
 * loaded and has an accepted type.
 *
 * A viewer whose file is not named by the route (a saved view names it in its data) passes
 * `path`: the dataset path, or a getter, ref or promise of it. A path that turns out to be
 * empty means there is nothing to load: no request is made, no error is set, and `entryLoaded`
 * is false. `allowMissing` lets a file that is not in the dataset load as `entry = null` (the
 * rest of the viewer still opens, and `entryLoaded` is true); other failures stay errors.
 * `title: null` leaves the page title to the caller.
 */
import { ref, shallowRef, unref } from 'vue';
import { useRoute } from 'vue-router';
import ddb from 'ddb';
import reg from '@/libs/api/sharedRegistry';
import { b64decode } from '@/libs/base64';
import { setTitle } from '@/libs/utils';
import { ApiError, InvalidLinkError, isNotFound } from '@/libs/ddb/apiError';
import { permissionsOf, NO_PERMISSIONS } from '@/libs/datasetPermissions';
import { useDatasetSessionStore } from '@/stores/datasetSession';

/**
 * @param {object} options
 * @param {string[]} [options.types]   accepted entry types (any when omitted)
 * @param {(entry: any) => boolean} [options.accepts]  a further test of the entry (the map: canOpenInMap)
 * @param {string} [options.typeLabel] "a 3D model": the error says the file "cannot be opened as <typeLabel>"
 * @param {string|null} options.title  page title suffix ("<file> - <title>"); null leaves the title alone
 * @param {string|import('vue').Ref<string|null>|Promise<string|null>|(() => string|null|Promise<string|null>)} [options.path]
 *   the dataset path of the file, when the route does not name it (its `encodedPath` is used by default)
 * @param {boolean} [options.allowMissing]  a file that is not in the dataset loads as `entry = null`, not as an error
 */
export function useViewerEntry({ types, accepts, typeLabel = 'this view', title, path: pathOption, allowMissing = false }) {
    const route = useRoute();
    const entry = shallowRef(null);
    const dataset = shallowRef(null);
    const ddbURI = ref('');
    const canRead = ref(false);
    const canWrite = ref(false);
    const canDelete = ref(false);
    const loading = ref(true);
    const error = ref('');
    /** @type {import('vue').ShallowRef<unknown>} */
    const loadError = shallowRef(null);

    /** The dataset path of the file, or null when the caller has none to load. */
    async function filePath() {
        if (pathOption === undefined) {
            const { encodedPath } = route.params;
            try {
                if (!encodedPath) throw new Error('no path');
                return b64decode(String(encodedPath));
            } catch {
                // A link cut short or edited by hand
                throw new InvalidLinkError('This link is not valid: the file path in the address cannot be read.');
            }
        }
        return (await (typeof pathOption === 'function' ? pathOption() : unref(pathOption))) || null;
    }

    /** The Registry answers an empty listing, which listOne reports as a plain error, for a file that is not there. */
    const isMissing = (/** @type {unknown} */ e) => !(e instanceof ApiError) || isNotFound(e);

    /** @returns {Promise<boolean>} whether there was a file to load */
    async function load() {
        const { org, ds: slug } = route.params;
        const path = await filePath();
        if (path === null) return false;
        const ds = reg.Organization(String(org)).Dataset(String(slug));
        ddbURI.value = ds.remoteUri(path);
        let e = null;
        try {
            e = await ds.listOne(path);
        } catch (listError) {
            if (allowMissing && isMissing(listError)) {
                // The viewer opens without it
            } else if (!(listError instanceof ApiError)) {
                // An empty listing: the file is not there (its page state, not found)
                throw new ApiError(listError.message, 404);
            } else {
                throw listError;
            }
        }
        if (e && ((types && !types.includes(e.type)) || (accepts && !accepts(e)))) throw new Error(`${e.path} cannot be opened as ${typeLabel}`);

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

        if (e) {
            useDatasetSessionStore().setSelectedFiles([{ path: ddbURI.value }]);
            if (title !== null) setTitle(`${ddb.pathutils.basename(e.path)} - ${title}`);
        }
        return true;
    }

    const entryLoaded = load().catch(e => {
        loadError.value = e;
        error.value = e.message;
        return false;
    }).finally(() => { loading.value = false; });

    return { entry, dataset, ddbURI, canRead, canWrite, canDelete, loading, error, loadError, entryLoaded };
}
