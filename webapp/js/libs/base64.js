// https://developer.mozilla.org/en-US/docs/Glossary/Base64
export function b64encode(str){
    return window.btoa(unescape(encodeURIComponent( str )));
}

export function b64decode(str){
    return decodeURIComponent(escape(window.atob( str )));
}