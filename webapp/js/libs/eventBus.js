/**
 * Global event bus using mitt (emit / on / off), for events no parent or store owns.
 */
import mitt from 'mitt';

const emitter = mitt();

export default emitter;
