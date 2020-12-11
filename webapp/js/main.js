import 'commonui/main';
import 'regenerator-runtime';
import Vue from 'vue';
import VueRouter from 'vue-router';

import '../css/app.scss';
import Header from './components/Header.vue';
import Login from './components/Login.vue';
import UserHome from './components/UserHome.vue';
import ViewDataset from './components/ViewDataset.vue';
import reg from './libs/sharedRegistry';

const APP_NAME = "DroneDB";

window.addEventListener('load', function(){
    Vue.use(VueRouter);
        
    const routes = [
        { path: '/r/:org/:ds', name: "ViewDataset", components: {content: ViewDataset, header: Header}, meta: { title: "View Dataset"}},
        { path: '/login', name: "Login", components: {content: Login, header: Header}, meta: { title: "Login" } },
        { path: '/r/:org', name: "UserHome", components: {content: UserHome, header: Header}, meta: { title: "Home"}},

        // TODO: add an actual home page
        { path: '/', name: "Login", components: {content: Login, header: Header}, meta: { title: "Login" } },
    ];
    const router = new VueRouter({ mode: "history", routes });

    // Set titles
    router.beforeEach((to, _, next) => {
        document.title = to.meta.title + ` - ${APP_NAME}`;
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
    if (window.location.href.indexOf("localhost") !== -1 ||
        window.location.href.indexOf("192.168.") !== -1 ||
        window.location.href.indexOf("127.0.0.1") !== -1){
        const livereload = document.createElement("script");
        livereload.src = `${window.location.protocol}//${window.location.hostname}:35729/livereload.js`;
        document.body.appendChild(livereload);
    }
});
