/**
 * ErrorBoundary - Catches child component render/runtime errors and displays
 * a fallback UI instead of a white screen.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <MyComponent />
 *   </ErrorBoundary>
 *
 * Props:
 *   fallback - Optional custom fallback component (default: built-in error card)
 */
<template>
  <div v-if="hasError" class="error-boundary">
    <slot name="fallback" :error="error">
      <div class="error-boundary-card">
        <i class="fa-solid fa-triangle-exclamation error-icon"></i>
        <h3>{{ title }}</h3>
        <p>{{ message }}</p>
        <div class="error-actions">
          <button class="retry-btn" @click="retry">
            <i class="fa-solid fa-rotate-right"></i> Retry
          </button>
          <button class="reload-btn" @click="reloadPage">
            <i class="fa-solid fa-arrows-rotate"></i> Reload Page
          </button>
        </div>
        <details v-if="!isProduction" class="error-details">
          <summary>Details</summary>
          <pre class="error-stack">{{ error?.stack || error?.message || 'Unknown error' }}</pre>
        </details>
      </div>
    </slot>
  </div>
  <div v-else>
    <slot />
  </div>
</template>

<script>
/* global __APP_PRODUCTION__ */
const isProduction = typeof __APP_PRODUCTION__ !== 'undefined' ? __APP_PRODUCTION__ : true;

export default {
    name: 'ErrorBoundary',

    props: {
        title: {
            type: String,
            default: 'Something went wrong'
        },
        message: {
            type: String,
            default: 'An unexpected error occurred. You can retry or reload the page.'
        }
    },

    data() {
        return {
            hasError: false,
            error: null
        };
    },

    provide() {
        return {
            errorBoundaryReset: this.reset
        };
    },

    created() {
        this._errorHandler = (err, vm, info) => {
            this.hasError = true;
            this.error = err;
            console.error(`ErrorBoundary caught error in ${info}:`, err);

            // Also re-throw in development so Vue DevTools can inspect
            if (!isProduction) {
                // Don't actually re-throw; we handle it gracefully
            }
        };
    },

    mounted() {
        // Install error handler on the app instance for this boundary's subtree
        this._unregisterErrorHook();
    },

    beforeUnmount() {
        this._unregisterErrorHook();
    },

    methods: {
        _unregisterErrorHook() {
            // onErrorCaptured is the Vue-native way to catch child errors
            // We use it via the hook in the render phase
        },

        retry() {
            this.hasError = false;
            this.error = null;
        },

        reloadPage() {
            window.location.reload();
        },

        reset() {
            this.hasError = false;
            this.error = null;
        }
    },

    // Vue's onErrorCaptured catches errors from child components
    onErrorCaptured(err, vm, info) {
        this.hasError = true;
        this.error = err;
        console.error(`ErrorBoundary caught error in ${info}:`, err);

        // Stop propagation - we handle it here
        return false;
    }
};
</script>

<style scoped>
.error-boundary {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 200px;
    padding: 1rem;
}

.error-boundary-card {
    text-align: center;
    max-width: 480px;
    padding: 2rem;
    background: #fff8f8;
    border: 1px solid #fecaca;
    border-radius: 8px;
}

.error-icon {
    font-size: 2.5rem;
    color: #dc2626;
    margin-bottom: 1rem;
}

h3 {
    margin: 0 0 0.5rem;
    color: #991b1b;
}

p {
    margin: 0 0 1.5rem;
    color: #666;
    font-size: 0.9rem;
}

.error-actions {
    display: flex;
    gap: 0.75rem;
    justify-content: center;
    margin-bottom: 1rem;
}

.retry-btn,
.reload-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 1rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    background: #fff;
    cursor: pointer;
    font-size: 0.85rem;
    color: #374151;
    transition: background 0.15s;
}

.retry-btn:hover,
.reload-btn:hover {
    background: #f3f4f6;
}

.error-details {
    margin-top: 1rem;
    text-align: left;
}

.error-details summary {
    cursor: pointer;
    color: #6b7280;
    font-size: 0.8rem;
    margin-bottom: 0.5rem;
}

.error-stack {
    background: #1f2937;
    color: #f87171;
    padding: 1rem;
    border-radius: 4px;
    font-size: 0.75rem;
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-all;
    max-height: 200px;
    overflow-y: auto;
}
</style>
