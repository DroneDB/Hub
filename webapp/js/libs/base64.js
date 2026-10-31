// https://developer.mozilla.org/en-US/docs/Glossary/Base64
export function b64encode(str){
    return window.btoa(unescape(encodeURIComponent( str )));
}

export function b64decode(str){
    return decodeURIComponent(escape(window.atob( str )));
}

// URL-safe alphabet without padding, so the result can sit in a path segment or query as it is
export function b64urlEncode(str){
    return b64encode(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Accepts the padding missing; throws on characters outside the URL-safe alphabet or invalid UTF-8
export function b64urlDecode(str){
    const unpadded = str.replace(/=+$/, '');
    if (!/^[A-Za-z0-9_-]*$/.test(unpadded)) throw new Error('Invalid base64url string');
    const b64 = unpadded.replace(/-/g, '+').replace(/_/g, '/');
    return b64decode(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='));
}
