const protoRegex = /^(file:\/\/|ddb:\/\/|ddb+unsafe:\/\/)/i;

const pathutils = {
    basename: function (path) {
        const pathWithoutProto = path.replace(protoRegex, "");
        const name = pathWithoutProto.split(/[\\/]/).pop();
        if (name) return name;
        else return pathWithoutProto;
    },

    // Extension of the last path component, lower-case with the dot ("" when none)
    extname: function (path) {
        const name = pathutils.basename(path);
        const i = name.lastIndexOf(".");
        return i > 0 ? name.substring(i).toLowerCase() : "";
    },

    // Last path component without its extension
    stem: function (path) {
        const name = pathutils.basename(path);
        const i = name.lastIndexOf(".");
        return i > 0 ? name.substring(0, i) : name;
    },

    // Path without the extension of its last component
    dropExtension: function (path) {
        const ext = pathutils.extname(path);
        return ext ? path.substring(0, path.length - ext.length) : path;
    },

    join: function (...paths) {
        return paths.map(p => {
            if (p[p.length - 1] === "/") return p.slice(0, p.length - 1);
            else return p;
        }).join("/");
    },

    // The dataset path a relative path names from `folder` ("" for the root): "." and ".." are
    // resolved, and null is returned for a path that leaves the dataset or names its root
    resolveRelative: function (folder, relative) {
        const parts = folder ? folder.split("/").filter(Boolean) : [];
        for (const segment of relative.split("/")) {
            if (segment === "" || segment === ".") continue;
            if (segment === "..") {
                if (!parts.length) return null;
                parts.pop();
            } else parts.push(segment);
        }
        return parts.length ? parts.join("/") : null;
    },

    getParentFolder: function (path) {
        if (typeof path === 'undefined' || path == null)
            throw "Path is required";

        var idx = path.lastIndexOf('/');
        if (idx == -1) return null;

        return path.substr(0, idx);
    },

    // Folders along a relative path, outermost first: "a/b" -> [{name:"a",path:"a"},{name:"b",path:"a/b"}]
    crumbs: function (path) {
        if (!path) return [];
        let cur = "";
        return path.split("/").filter(Boolean).map(name => {
            cur = cur ? cur + "/" + name : name;
            return { name, path: cur };
        });
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

    removeTrailingSlash: function(path){
        if (path.length > 1 && path[path.length - 1] === '/') path = path.substring(0, path.length - 1);
        return path;
    }
};

export default pathutils;
