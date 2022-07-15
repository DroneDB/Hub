export default {
    rootPath: function(path){
        if (path.indexOf("/") === 0) return path;
        else return "/" + path;
    }
}