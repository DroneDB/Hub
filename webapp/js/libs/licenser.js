import { KEYUTIL } from 'jsrsasign';

function getLicenseInfo(productId, license){
    const pubkey = `-----BEGIN PUBLIC KEY-----
    MFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBANYMD3arHzC5LtLsSSSXaJrNPpld9H17
    VoVtKfGxbtFNiME+3ffgu1srP1nvu4meZCfh+1Bwo1ufKKm/DFjHJ9MCAwEAAQ==
    -----END PUBLIC KEY-----`;

    license = license.replace(/^\s*/, "");
    license = license.replace(/\s*$/, "");
    license = license.replace(/\s*=+\s+END\sLICENSE\s+=+\s*/i, "");
    license = license.replace(/\s*=+\s+BEGIN\sLICENSE\s+=+\s*/i, "");
    license = license.trim()
    license = license.replace(/\r\n/g, "\n");
    const lines = license.split("\n").filter(l => l.trim().length > 0);

    // The first line should always contain a "Param: value" string
    // if not, the user likely just copied/paste the numbers from the license.
    let hint = "";
    if (lines.length > 0 && lines[0].indexOf(":") === -1 && lines[0].split(" ").length >= 4){
        hint = `The license starts with ===== BEGIN LICENSE ===== and ends with ===== END LICENSE =====. It looks like you included only part of it? Make sure to copy all of it, including Name and Quantity labels.`; 
    }

    const data = [`Product: ${productId}`].concat(lines.filter(l => l.indexOf(":") !== -1)).join("\n") + "\n";
    const signature = lines.filter(l => l.indexOf(":") === -1)
                             .map(l => l.replace(/\s/g, "")
                             .toLowerCase()).join("");

    const pubKey = KEYUTIL.getKey(pubkey);
    if (pubKey.verify(data, signature)){
        const res = {name: "", quantity: -1, hint};
        data.split("\n").forEach(l => {
            const [k, v] = l.split(":").map(l => l.trim());
            if (k) res[k.toLowerCase()] = v;
        });
        return res;
    }else{
        return {
            name: "",
            quantity: -1,
            hint
        };
    }    
}

function isValid(productId, license){
    return getLicenseInfo(productId, license).quantity > 0;
}

function loadLicense(){
    const license = localStorage.getItem("license") || "";
    if (!license) return false;

    return getLicenseInfo("dronedbdesktopv1", license);
}

function saveLicense(license){
    if (isValid("dronedbdesktopv1", license)){
        localStorage.setItem("license", license);
    }else{
        console.warn("Invalid license: " + license);
    }
}

function isLicensed(){
    return loadLicense().quantity > 0;
}

export default { getLicenseInfo, isValid, loadLicense, saveLicense, isLicensed };
