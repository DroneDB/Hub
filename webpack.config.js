const VueLoaderPlugin = require('vue-loader/lib/plugin');
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
        // publicPath: "/build/"
    },

    devtool: "source-map",

    module: {
        rules: [
            {
                test: /\.vue$/,
                exclude: /(node_modules|bower_components)/,
                loader: 'vue-loader',
                options: {
                    loaders: {
                        'scss': [
                            'vue-style-loader',
                            'css-loader',
                            'sass-loader'
                        ]
                    }
                }
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
                                '@babel/plugin-transform-private-property-in-object'
                            ]
                        }
                    }
                ],
            },
            {
                test: /\.s?css$/,
                use: [
                    {
                        loader: "vue-style-loader" // creates style nodes from JS strings
                    },
                    {
                        loader: "css-loader" // translates CSS into CommonJS
                    },
                    {
                        loader: "sass-loader",
                        options: {
                            implementation: require("sass")
                        }
                    }
                ]
            },
            {
                test: /\.(png|woff|woff2|eot|ttf|svg|jpg|gif)$/,
                use: {
                    loader: 'url-loader',
                    options: {
                        limit: 131072
                    }
                }
            }
        ]
    },
    plugins: [
        new VueLoaderPlugin(),
        new LiveReloadPlugin(),
        new webpack.NormalModuleReplacementPlugin(/(.*)polyfills\/node\/(.*)/, function (resource) {
            resource.request = resource.request.replace(/polyfills\/node\//, `polyfills\/web\/`);
        }),
        new CopyPlugin({
            patterns: [
                { from: 'webapp/public', to: '' }
            ]
        })
    ],

    node: {
        fs: 'empty'
    },

    resolve: {
        alias: {
            'vue$': 'vue/dist/vue.esm.js',
            'ddb': path.resolve(__dirname, 'vendor/ddb_js')
        },
        extensions: ['*', '.js', '.vue', '.json']
    },

    externals: {
    }
}
