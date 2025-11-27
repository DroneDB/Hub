import Registry from './ddb/registry';

// Shared instance of registry
export let reg = new Registry(window.location.origin);

export default reg;