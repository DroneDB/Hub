
import 'commonui/main';
import Vue from 'vue';
import VueRouter from 'vue-router';
import VueLogger from 'vuejs-logger';

import '../css/app.scss';
import Header from './components/Header.vue';
import Login from './components/Login.vue';
import UserHome from './components/UserHome.vue';
import ViewDataset from './components/ViewDataset.vue';
import Upload from './components/Upload.vue';
import reg from './libs/sharedRegistry';
import { setTitle, queryParams, inIframe } from './libs/utils';

window.addEventListener('load', function(){
    const isProduction = window.location.href.indexOf("localhost") == -1 &&
                        window.location.href.indexOf("192.168.") == -1 &&
                        window.location.href.indexOf("127.0.0.1") == -1;

    const options = {
        isEnabled: true,
        logLevel : isProduction ? 'error' : 'debug',
        stringifyArguments : false,
        showLogLevel : true,
        showMethodName : true,
        separator: '|',
        showConsoleColors: true
    };

    let hdr = Header;

    // Hide header if ?embed=1 is in URL
    const embed = !!queryParams(window.location).embed || inIframe();
    if (embed) hdr = null;

    Vue.use(VueLogger, options);
    Vue.use(VueRouter);
    
    const routes = [
        { path: '/r/:org/:ds', name: "ViewDataset", components: {content: ViewDataset, header: hdr}, meta: { title: "View Dataset"}},
        { path: '/login', name: "Login", components: {content: Login, header: hdr}, meta: { title: "Login" }},
        { path: '/r/:org', name: "UserHome", components: {content: UserHome, header: hdr}, meta: { title: "Home"}},
        { path: '/upload', name: "Upload", components: {content: Upload, header: hdr}, meta: { title: "Upload" }},
        // TODO: add an actual home page
        { path: '/', name: "LoginHome", components: {content: Login, header: hdr}, meta: { title: "Login" }},
    ];
    const router = new VueRouter({ mode: "history", routes });

    // Set titles, keep track of previous routes
    router.beforeEach((to, prev, next) => {
        setTitle(to.meta.title);
        to.meta.prev = prev;
        next();
    });

    // Refresh auth tokens
    if (reg.isLoggedIn()){
        reg.refreshToken();
        reg.setAutoRefreshToken();
    }else{
        reg.clearCredentials();
    }

    new Vue({
        router
    }).$mount("#app");

    Vue.config.errorHandler = function (err, vm, info) {
        // Catch unauthorized error globally
        if (err.message === "Unauthorized"){
            router.push({name: "Login"}).catch(()=>{});
        }else{
            throw err;
        }
    }


    document.getElementById("main-loading").style.display = 'none';

    // Live reload
    if (!isProduction){
        const livereload = document.createElement("script");
        livereload.src = `${window.location.protocol}//${window.location.hostname}:35729/livereload.js`;
        document.body.appendChild(livereload);
    }
});
