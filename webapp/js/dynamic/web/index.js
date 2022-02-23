import menu from './menu';
import shell from './shell';
import pathutils from './pathutils';
import env from './env';

if (!window.__menu){
    window.__menu = menu;
    window.__shell = shell;
    window.__pathutils = pathutils;
    window.__env = env;
}