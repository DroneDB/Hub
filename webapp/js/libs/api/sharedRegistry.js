import Registry from '@/libs/ddb/registry';

// Shared instance of registry
let reg = Registry.forUrl(window.location.origin);

export default reg;