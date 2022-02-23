import { utils } from 'ddb';

export default {
    openItem: (uri) => {
        if (utils.isDDBUri(uri)){
            // Create download link and open it in new window
            const [ds, path] = utils.datasetPathFromUri(uri);
            window.open(ds.downloadUrl(path, { inline: true }), uri);
        }else if (uri.toLowerCase().startsWith("http://") || uri.toLowerCase().startsWith("https://")){
            // Open link
            window.open(uri, "_blank");
        }else{
            console.warn(`Cannot open ${uri}`);
        }
    },
    showItemInFolder: (uri) => {
        console.log(uri);
    }
}