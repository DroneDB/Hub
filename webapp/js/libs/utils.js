export function setTitle(title){
    // TODO: where to set DroneDB hard-coded string
    document.title = `${title} - DroneDB`;
}

export function getCookie(key){
    const cobj = document.cookie
      .split(';')
      .map(v => v.split('='))
      .reduce((acc, v) => {
        acc[decodeURIComponent(v[0].trim())] = decodeURIComponent(v[1].trim());
        return acc;
      }, {});
    return cobj[key];
}

export function clearCookie(key){
    document.cookie = `${key}=;-1;path=/`;
}

export function queryParams(location){
    let params = {};
    let paramsRaw = (location.search.replace("?", "").match(/([^&=]+)=?([^&]*)/g) || []);
    for (let i in paramsRaw){
      let parts = paramsRaw[i].split("=");
      if (parts[1] !== undefined){
          params[parts[0]] = parts[1];
      }
    }
    return params;
};