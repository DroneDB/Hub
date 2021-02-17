import { getCookie } from './utils';

// xAuthToken cookie contains:
// <auth token>|<logout url>

export function xAuthAvailable(){
    return !!getCookie("xAuthToken");
}

export function getXAuthToken(){
    if (xAuthAvailable()){
        return getCookie("xAuthToken").split("|")[0];
    }else return "";
}

export function getXAuthLogoutUrl(){
    if (xAuthAvailable()){
        return getCookie("xAuthToken").split("|")[1];
    }else return "";
}

export async function xAuthLogout(){
    return new Promise((resolve, reject) => {
        if (!xAuthAvailable()) resolve();

        const el = document.createElement("iframe");
        el.src = getXAuthLogoutUrl();
        el.onload = () => {
            el.remove();
            resolve();
        };
        el.onerror = reject;
        el.width = 1;
        el.height = 1;
        document.body.append(el);
    })
}