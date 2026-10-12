import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig({
    plugins: [vue()],
    resolve: {
        // Match webpack: components are imported without the .vue extension.
        extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json', '.vue'],
        alias: {
            '@': path.resolve(__dirname, 'webapp/js'),
            'ddb': path.resolve(__dirname, 'webapp/js/libs/ddb')
        }
    },
    test: {
        globals: true,
        environment: 'happy-dom',
        include: ['webapp/js/**/*.spec.js', 'webapp/js/**/*.test.js'],
        setupFiles: ['./test-setup.js'],
        coverage: {
            provider: 'istanbul',
            reporter: ['text', 'json', 'html'],
            include: ['webapp/js/libs/**/*.js', 'webapp/js/composables/**/*.js'],
            exclude: [
                'webapp/js/vendor/**',
                'webapp/js/libs/ddb/**',
                'webapp/js/libs/map/potree/**'
            ]
        }
    }
});
