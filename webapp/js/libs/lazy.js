const loadedUrls = {};

export async function loadResources(urls){
    if (typeof urls === "string") urls = [urls];
    
    const loadResource = async function(url){
        return new Promise((resolve, reject) => {
            if (loadedUrls[url]){
                resolve(url);
                return;
            }

            if (url.endsWith(".js")){
                const scriptTag = document.createElement('script');
                scriptTag.src = url;
                scriptTag.onload = () => {
                    loadedUrls[url] = true;
                    resolve(url);
                };
                scriptTag.onerror = reject;
                document.body.appendChild(scriptTag);
            }else if (url.endsWith(".css")){
                const head  = document.getElementsByTagName('head')[0];
                const link  = document.createElement('link');
                link.rel  = 'stylesheet';
                link.type = 'text/css';
                link.href = url;
                link.media = 'all';
                head.appendChild(link);
                link.onload = () => {
                    loadedUrls[url] = true;
                    resolve(url);
                }
            }
        });
    };

    return Promise.all(urls.map(loadResource));
}