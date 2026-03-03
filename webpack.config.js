const { VueLoaderPlugin } = require('vue-loader');
const CopyPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const webpack = require('webpack');
const path = require('path');

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

    optimization: isProduction ? {
        splitChunks: {
            chunks: 'all',
            cacheGroups: {
                vendor: {
                    test: /[\\/]node_modules[\\/]/,
                    name: 'vendors',
                    chunks: 'all',
                },
                openlayers: {
                    test: /[\\/]node_modules[\\/]ol[\\/]/,
                    name: 'openlayers',
                    chunks: 'all',
                    priority: 10,
                },
            },
        },
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
                { from: 'webapp/public', to: '', globOptions: { ignore: ['**/index.html'] } }
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
            'ddb': path.resolve(__dirname, 'webapp/js/libs/ddb')
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
