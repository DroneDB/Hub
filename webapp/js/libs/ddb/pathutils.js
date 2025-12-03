const protoRegex = /^(file:\/\/|ddb:\/\/|ddb+unsafe:\/\/)/i;

module.exports = {
    basename: function (path) {
        const pathWithoutProto = path.replace(protoRegex, "");
        const name = pathWithoutProto.split(/[\\/]/).pop();
        if (name) return name;
        else return pathWithoutProto;
    },

    join: function (...paths) {
        return paths.map(p => {
            if (p[p.length - 1] === "/") return p.slice(0, p.length - 1);
            else return p;
        }).join("/");
    },

    getParentFolder: function (path) {
        if (typeof path === 'undefined' || path == null)
            throw "Path is required";

        var idx = path.lastIndexOf('/');
        if (idx == -1) return null;

        return path.substr(0, idx);
    },

    getTree: function (path) {
        path = path.replace("file://", "");

        var folders = [];
        var f = path;
        do {
            folders.push(this.removeTrailingSlash(f));
            f = this.getParentFolder(f);
        } while (f != null);

        return folders.reverse();
    },

    localPathFromUri: function(uri){
        if (!uri.startsWith("file://")) throw new Error("Not a local URI");

        let p = uri.replace("file://", "");
        
        return this.removeTrailingSlash(p);
    },

    removeTrailingSlash: function(path){
        if (path.length > 1 && path[path.length - 1] === '/') path = path.substring(0, path.length - 1);
        return path;
    }
}
