const { VueLoaderPlugin } = require('vue-loader');
const LiveReloadPlugin = require('webpack-livereload-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');
const path = require('path');

module.exports = {
    mode: 'development',

    entry: {
        main: path.join(__dirname, './webapp/js/main.js')
    },

    output: {
        path: path.join(__dirname, './build'),
        filename: "[name].js",
        sourceMapFilename: "[name].js.map"
    },

    devtool: "source-map",

    module: {
        rules: [
            {
                test: /\.vue$/,
                exclude: /(node_modules|bower_components)/,
                loader: 'vue-loader'
            }, {
                test: /\.js$/,
                include: [
                    path.resolve(__dirname, 'webapp'),
                    path.resolve(__dirname, 'node_modules/ol'),
                    path.resolve(__dirname, 'node_modules/color-parse'),
                    path.resolve(__dirname, 'node_modules/color-rgba'),
                    path.resolve(__dirname, 'node_modules'),
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
                    'vue-style-loader',
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
                    'vue-style-loader',
                    'css-loader'
                ]
            },
            {
                test: /\.(png|woff|woff2|eot|ttf|svg|jpg|gif)$/,
                type: 'asset',
                parser: {
                    dataUrlCondition: {
                        maxSize: 131072
                    }
                }
            }
        ]
    },

    plugins: [
        new VueLoaderPlugin(),
        new LiveReloadPlugin(),
        new webpack.DefinePlugin({
            __VUE_OPTIONS_API__: true,
            __VUE_PROD_DEVTOOLS__: false,
            __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false
        }),
        new webpack.NormalModuleReplacementPlugin(/(.*)polyfills\/node\/(.*)/, function (resource) {
            resource.request = resource.request.replace(/polyfills\/node\//, `polyfills\/web\/`);
        }),
        new CopyPlugin({
            patterns: [
                { from: 'webapp/public', to: '' }
            ]
        })
    ],

    resolve: {
        alias: {
            'vue$': 'vue/dist/vue.esm-bundler.js',
            'ddb': path.resolve(__dirname, 'webapp/js/libs/ddb')
        },
        extensions: ['*', '.js', '.vue', '.json'],
        fallback: {
            fs: false,
            path: false
        }
    },

    externals: {
    }
}
