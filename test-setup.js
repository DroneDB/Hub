/**
 * Vitest setup file - runs before each test (happy-dom environment).
 * Defines the globals webpack's DefinePlugin sets at build time.
 */

// __APP_PRODUCTION__ (webpack DefinePlugin)
globalThis.__APP_PRODUCTION__ = true;

// __HUB_VERSION__ (webpack DefinePlugin, from package.json)
globalThis.__HUB_VERSION__ = '2.7.0';
