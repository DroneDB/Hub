const { VueLoaderPlugin } = require('vue-loader');
const CopyPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const CompressionPlugin = require('compression-webpack-plugin');
const webpack = require('webpack');
const path = require('path');
const zlib = require('zlib');

const pkg = require('./package.json');
const { minify } = require('terser');

// Potree 1.8 ships these unminified. They are minified when copied (production builds):
// names are kept, as Potree looks up some of its classes by name.
const POTREE_MINIFIED = [
    'potree/build/potree/potree.js',
    'potree/build/potree/workers/LASLAZWorker.js',
    'potree/build/potree/workers/EptLaszipDecoderWorker.js',
    'potree/build/potree/workers/2.0/DecoderWorker_brotli.js',
    'potree/libs/spectrum/spectrum.js',
    'potree/libs/plasio/js/laslaz.js'
];

async function minifyPotreeScript(content) {
    const result = await minify(content.toString(), {
        compress: true, mangle: true, keep_classnames: true, keep_fnames: true, format: { comments: false }
    });
    return result.code;
}
const isProduction = process.env.NODE_ENV === 'production';

// Text assets worth a precompressed twin
const COMPRESSIBLE = /\.(js|css|html|svg|wasm|json|txt|xml)$/i;

module.exports = {
    mode: isProduction ? 'production' : 'development',

    entry: {
        main: path.join(__dirname, './webapp/js/main.js')
    },

    output: {
        path: path.join(__dirname, './build'),
        filename: isProduction ? "[name].[contenthash:8].js" : "[name].js",
        sourceMapFilename: "[name].js.map",
        publicPath: '/',
        clean: true,
    },

    devtool: isProduction ? false : "source-map",

    module: {
        rules: [
            {
                test: /\.vue$/,
                exclude: /(node_modules|bower_components)/,
                loader: 'vue-loader'
            },
            {
                test: /\.js$/,
                include: [
                    path.resolve(__dirname, 'webapp'),
                    path.resolve(__dirname, 'node_modules/ol'),
                    path.resolve(__dirname, 'node_modules/color-parse'),
                    path.resolve(__dirname, 'node_modules/color-rgba')
                ],
                use: [
                    {
                        loader: 'babel-loader',
                        options: {
                            presets: [
                                ['@babel/preset-env', {
                                    targets: {
                                        browsers: [
                                            'last 2 Chrome versions',
                                            'last 2 Firefox versions',
                                            'last 2 Safari versions',
                                            'last 2 Edge versions',
                                            'last 2 iOS versions',
                                            'last 2 Android versions'
                                        ]
                                    }
                                }]
                            ]
                        }
                    }
                ],
            },
            // Handle application CSS/SCSS files
            {
                test: /\.s[ac]ss$/i,
                exclude: /node_modules/,
                use: [
                    isProduction ? MiniCssExtractPlugin.loader : 'vue-style-loader',
                    'css-loader',
                    {
                        loader: 'sass-loader',
                        options: {
                            implementation: require('sass'),
                            api: 'modern-compiler'
                        }
                    }
                ]
            },
            // Handle regular CSS files
            {
                test: /\.css$/i,
                use: [
                    isProduction ? MiniCssExtractPlugin.loader : 'vue-style-loader',
                    'css-loader'
                ]
            },
            {
                // Fonts are always files: hashed, cached once, and only the faces and subsets
                // a page uses are downloaded
                test: /\.(woff|woff2|eot|ttf)$/,
                type: 'asset/resource'
            },
            {
                // The viewer's default place for its worker, new URL('.', import.meta.url), is a
                // folder, which webpack takes for an asset it cannot resolve. The Hub always gives
                // the folder (decoderPath, served by the CopyPlugin below), so the URL stays as written.
                test: /\.js$/,
                include: path.resolve(__dirname, 'node_modules/bm3d-viewer'),
                parser: { url: false }
            },
            {
                test: /\.(png|svg|jpg|gif)$/,
                type: 'asset',
                parser: {
                    // Small icons stay inline
                    dataUrlCondition: {
                        maxSize: 8 * 1024
                    }
                }
            }
        ]
    },

    optimization: isProduction ? {
        minimizer: [
            new TerserPlugin({
                exclude: /potree/,
            }),
        ],
        // One chunk per concern. The heavy viewer libraries are async: they load with
        // the viewer that needs them, never with the login page. The default group has no
        // fixed name, so webpack splits the remaining packages by the chunks that use them
        // instead of merging every package into one initial file.
        splitChunks: {
            chunks: 'all',
            maxInitialRequests: 10,
            cacheGroups: {
                vue: {
                    test: /[\\/]node_modules[\\/](vue|vue-router|@tanstack)[\\/]/,
                    name: 'vendor-vue',
                    priority: 20
                },
                primevue: {
                    test: /[\\/]node_modules[\\/](primevue|@primevue)[\\/]/,
                    name: 'vendor-primevue',
                    priority: 20
                },
                three: {
                    test: /[\\/]node_modules[\\/](three|@giro3d|@sparkjsdev|laz-perf|copc)[\\/]/,
                    name: 'vendor-3d',
                    chunks: 'async',
                    priority: 25
                },
                chartjs: {
                    test: /[\\/]node_modules[\\/]chart\.js[\\/]/,
                    name: 'vendor-chartjs',
                    chunks: 'async',
                    priority: 15
                },
                codemirror: {
                    test: /[\\/]node_modules[\\/]@codemirror[\\/]/,
                    name: 'vendor-codemirror',
                    chunks: 'async',
                    priority: 15
                },
                openlayers: {
                    test: /[\\/]node_modules[\\/](ol|proj4|color-parse|color-rgba)[\\/]/,
                    name: 'vendor-openlayers',
                    chunks: 'async',
                    priority: 10
                },
                defaultVendors: {
                    test: /[\\/]node_modules[\\/]/,
                    priority: -10,
                    reuseExistingChunk: true
                }
            }
        }
    } : {},

    plugins: [
        new VueLoaderPlugin(),
        // LiveReload only in development
        ...(isProduction ? [] : [new (require('webpack-livereload-plugin'))()]),
        new webpack.DefinePlugin({
            __VUE_OPTIONS_API__: true,
            __VUE_PROD_DEVTOOLS__: false,
            __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
            __APP_PRODUCTION__: JSON.stringify(isProduction),
            __HUB_VERSION__: JSON.stringify(pkg.version),
        }),
        new HtmlWebpackPlugin({
            template: path.join(__dirname, 'webapp/public/index.html'),
            inject: 'body',
        }),
        new CopyPlugin({
            patterns: [
                {
                    from: 'webapp/public', to: '', globOptions: {
                        ignore: [
                            '**/index.html',
                            // Potree workers the Hub never starts. It loads COPC only
                            // (EptLaszipDecoderWorker); the EPT binary/zstandard workers import
                            // /libs/ept and /libs/zstd-codec, which are not shipped, and the plasio
                            // workers are superseded by workers/LASLAZWorker.js.
                            '**/potree/build/potree/workers/EptZstandardDecoderWorker.js*',
                            '**/potree/build/potree/workers/EptBinaryDecoderWorker.js',
                            '**/potree/libs/plasio/workers/**',
                            // The viewer loads the minified d3 and jsTree that Potree ships, and
                            // laslaz.js's bluebird import is commented out
                            '**/potree/libs/d3/d3.js',
                            '**/potree/libs/jstree/jstree.js',
                            '**/potree/libs/plasio/vendor/**',
                            // Copied minified below
                            ...(isProduction ? POTREE_MINIFIED.map(f => '**/' + f) : [])
                        ]
                    }
                },
                ...(isProduction ? POTREE_MINIFIED.map(f => ({
                    from: 'webapp/public/' + f, to: f,
                    transform: { transformer: minifyPotreeScript, cache: true }
                })) : []),
                // Serve the laz-perf WebAssembly decoder locally (offline-first): the unified
                // Giro3D viewer configures setLazPerfPath('/wasm') so COPC point clouds decode
                // without fetching the .wasm from a public CDN.
                { from: 'node_modules/laz-perf/lib/laz-perf.wasm', to: 'wasm/laz-perf.wasm' },
                // Serve the Basis Universal transcoder locally (offline-first): the unified viewer
                // passes ktx2DecoderPath: '/wasm/basis/' to Tiles3D so KTX2 / KHR_texture_basisu
                // textures transcode without fetching the transcoder from a public CDN.
                { from: 'node_modules/three/examples/jsm/libs/basis/basis_transcoder.js', to: 'wasm/basis/basis_transcoder.js' },
                { from: 'node_modules/three/examples/jsm/libs/basis/basis_transcoder.wasm', to: 'wasm/basis/basis_transcoder.wasm' },
                // Serve the bm3d decoder locally: the 3D model viewer passes decoderPath: '/wasm/bm3d/'
                // to Bm3dObject, which starts the worker from there (a worker must come from the
                // page's origin) and loads corto.wasm next to it.
                { from: 'node_modules/bm3d-viewer/dist/corto-worker.js', to: 'wasm/bm3d/corto-worker.js' },
                { from: 'node_modules/bm3d-viewer/dist/corto.wasm', to: 'wasm/bm3d/corto.wasm' }
            ]
        }),
        // CSS extraction for production builds
        ...(isProduction ? [new MiniCssExtractPlugin({
            filename: '[name].[contenthash:8].css',
        })] : []),
        // Compress once at build time at the highest levels; the Registry serves the
        // .br / .gz twin instead of compressing every response again at a fast level
        ...(isProduction ? [
            new CompressionPlugin({
                filename: '[path][base].br',
                algorithm: 'brotliCompress',
                test: COMPRESSIBLE,
                compressionOptions: { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } },
                threshold: 1024,
                minRatio: 0.9
            }),
            new CompressionPlugin({
                filename: '[path][base].gz',
                algorithm: 'gzip',
                test: COMPRESSIBLE,
                compressionOptions: { level: 9 },
                threshold: 1024,
                minRatio: 0.9
            })
        ] : []),
    ],

    resolve: {
        alias: {
            'ddb': path.resolve(__dirname, 'webapp/js/libs/ddb'),
            '@': path.resolve(__dirname, 'webapp/js')
        },
        extensions: ['.js', '.vue', '.json'],
        fallback: {
            fs: false,
            path: false,
            punycode: false
        }
    }
}
