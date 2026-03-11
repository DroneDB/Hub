/**
 * Global event bus using mitt.
 * Replaces Vue 2's $root.$on/$emit/$off pattern.
 */
import mitt from 'mitt';

const emitter = mitt();

export default emitter;
