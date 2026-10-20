import Registry from '@/libs/ddb/registry';

// Shared instance of registry
export let reg = Registry.forUrl(window.location.origin);

export default reg;