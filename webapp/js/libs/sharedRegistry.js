import { Registry } from 'ddb';

// Shared instance of registry
export let reg = new Registry(window.location.origin);

export default reg;