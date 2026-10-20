const { VueLoaderPlugin } = require('vue-loader');
const CopyPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const webpack = require('webpack');
const path = require('path');

const pkg = require('./package.json');
const isProduction = process.env.NODE_ENV === 'production';

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
                    path.resolve(__dirname, 'node_modules/color-rgba'),
                    path.resolve(__dirname, 'vendor')
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
                            ], plugins: [
                                '@babel/plugin-transform-nullish-coalescing-operator',
                                '@babel/plugin-transform-optional-chaining',
                                '@babel/plugin-transform-class-properties',
                                '@babel/plugin-transform-private-methods',
                                '@babel/plugin-transform-private-property-in-object']
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
                // a page uses are downloaded (HUB-01: 850 KB of base64 fonts were in the CSS)
                test: /\.(woff|woff2|eot|ttf)$/,
                type: 'asset/resource'
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
        // HUB-01: one chunk per concern. The heavy viewer libraries are async: they load with
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
        new webpack.NormalModuleReplacementPlugin(/(.*)polyfills\/node\/(.*)/, function (resource) {
            resource.request = resource.request.replace(/polyfills\/node\//, `polyfills\/web\/`);
        }),
        new HtmlWebpackPlugin({
            template: path.join(__dirname, 'webapp/public/index.html'),
            inject: 'body',
        }),
        new CopyPlugin({
            patterns: [
                { from: 'webapp/public', to: '', globOptions: { ignore: ['**/index.html'] } },
                // Serve the laz-perf WebAssembly decoder locally (offline-first): the unified
                // Giro3D viewer configures setLazPerfPath('/wasm') so COPC point clouds decode
                // without fetching the .wasm from a public CDN.
                { from: 'node_modules/laz-perf/lib/laz-perf.wasm', to: 'wasm/laz-perf.wasm' },
                // Serve the Basis Universal transcoder locally (offline-first): the unified viewer
                // passes ktx2DecoderPath: '/wasm/basis/' to Tiles3D so KTX2 / KHR_texture_basisu
                // textures transcode without fetching the transcoder from a public CDN.
                { from: 'node_modules/three/examples/jsm/libs/basis/basis_transcoder.js', to: 'wasm/basis/basis_transcoder.js' },
                { from: 'node_modules/three/examples/jsm/libs/basis/basis_transcoder.wasm', to: 'wasm/basis/basis_transcoder.wasm' }
            ]
        }),
        // CSS extraction for production builds
        ...(isProduction ? [new MiniCssExtractPlugin({
            filename: '[name].[contenthash:8].css',
        })] : []),
    ],

    resolve: {
        alias: {
            'vue$': 'vue/dist/vue.esm-bundler.js',
            'ddb': path.resolve(__dirname, 'webapp/js/libs/ddb'),
            '@': path.resolve(__dirname, 'webapp/js')
        },
        extensions: ['.js', '.vue', '.json'],
        fallback: {
            fs: false,
            path: false,
            punycode: false
        }
    },

    externals: {
    }
}
