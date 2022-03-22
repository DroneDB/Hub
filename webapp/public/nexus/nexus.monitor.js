let css="\n#nexusMonitor {\n\tposition:absolute; \n\ttop:5px; right:5px; \n\topacity:0.7; \n\tbackground-color:black; \n\tcolor:white;\n\tpadding:10px 20px;\n\twidth:300px;\n\tfont-family: Arial, Helvetica, sans-serif;\t\n}\n#nexusMonitor table, #monitor tr { color:white; width:100% }\n#nexusMonitor p { margin:0px 10px; padding:5px 0px; }\n\n.progress {\n\tcolor:black;\n\theight: 1.5em;\n\tfont-weight: bold;\n\twidth: 100%;\n\tbackground-color: #c9c9c9;\n\tposition: relative;\n}\n.progress:before {\n\tcontent: attr(data-label);\n\tfont-size: 0.8em;\n\tposition: absolute;\n\ttext-align: center;\n\ttop: 5px;\n\tleft: 0;\n\tright: 0;\n}\n.progress .value {\n\tbackground-color: #7cc4ff;\n\tdisplay: inline-block;\n\theight: 100%;\n}",style=document.createElement("STYLE");style.type="text/css",style.appendChild(document.createTextNode(css)),document.head.appendChild(style);var nexusMonitor=null,nexusMonitorInterval=null,updateNexusMonitor=function(){};function startNexusMonitor(){stopNexusMonitor(),nexusMonitor.style.display="block",nexusMonitorInterval=setInterval(updateNexusMonitor,100)}function stopNexusMonitor(){nexusMonitor.style.display="none",nexusMonitorInterval&&clearInterval(nexusMonitorInterval)}document.addEventListener("DOMContentLoaded",function(){(nexusMonitor=document.createElement("div")).setAttribute("id","nexusMonitor");nexusMonitor.innerHTML='<table>\n\t\t<tr><td style="width:30%">Cache</td>\n\t\t\t<td style="width:70%"><div class="progress" id="nexusMonitorCache" data-label="">\n\t\t\t\t<span class="value"></span>\n\t\t\t</div></td></tr>\n\t\t<tr><td>Error</td>\n\t\t\t<td style="width:70%"><div class="progress" id="nexusMonitorError" data-label="">\n\t\t\t\t<span class="value"></span>\n\t\t\t</div></td></tr>\n\n\t\t<tr><td>Fps</td>\n\t\t\t<td style="width:70%"><div class="progress" id="nexusMonitorFps" data-label="">\n\t\t\t\t<span class="value"></span>\n\t\t\t</div></td></tr>\n\t\t<tr><td>Rendered</td>\n\t\t\t<td><span id="nexusMonitorTriangles"></span></td></tr>\n\t\t<tr><td></td>\n\t\t\t<td><input type="checkbox" id="nexusMonitorNodes"> Show patches</td></tr>\n\t\t<tr><td>Target Error</td>\n\t\t\t<td><input type="number" min="0" max="100" id="nexusMonitorEditError"> px</td></tr>\n\n\t</table>';let t=nexusMonitor.querySelector("#nexusMonitorCache"),e=nexusMonitor.querySelector("#nexusMonitorCache > span"),n=nexusMonitor.querySelector("#nexusMonitorError"),o=nexusMonitor.querySelector("#nexusMonitorError > span"),r=nexusMonitor.querySelector("#nexusMonitorFps"),s=nexusMonitor.querySelector("#nexusMonitorFps > span"),i=nexusMonitor.querySelector("#nexusMonitorTriangles"),a=nexusMonitor.querySelector("#nexusMonitorNodes"),d=nexusMonitor.querySelector("#nexusMonitorEditError");a.addEventListener("click",function(){Nexus.Debug.nodes=this.checked}),d.addEventListener("change",function(){"undefined"!=typeof Nexus&&0!=Nexus.contexts.length&&(Nexus.contexts[0].targetError=this.value)}),document.body.appendChild(nexusMonitor);const l=t=>{return"rgba("+255*t/100+","+(255-255*t/100)+",0,0.5)"};function u(t,e="",n=1){if(0===t)return"0 Bytes";const o=n<0?0:n,r=Math.floor(Math.log(t)/Math.log(1024));return parseFloat((t/Math.pow(1024,r)).toFixed(o))+" "+["","K","M","G","T","P","E","Z","Y"][r]+e}updateNexusMonitor=function(){if("undefined"==typeof Nexus||0==Nexus.contexts.length)return;let a=Nexus.contexts[0],c=a.cacheSize,x=a.maxCacheSize,p=100*c/x,M=a.targetError,h=a.realError,y=a.currentError,g=100*Math.min(1,Math.log2(y/M)),b=(a.minFps,a.currentFps),v=100*Math.min(1,b/60),f=a.rendered;t.setAttribute("data-label",`${u(c,"B")}/${u(x,"B")}`),e.style.backgroundColor=l(p),e.style.width=p+"%",n.setAttribute("data-label",`Real: ${h.toFixed(1)} px  Current: ${y.toFixed(1)} px`),o.style.backgroundColor=l(g),o.style.width=g,r.setAttribute("data-label",`${parseInt(Math.round(b))} fps`),s.style.backgroundColor=l(100-v),s.style.width=v+"%",i.innerHTML=`${u(f)} triangles`,d.value||(d.value=M)},startNexusMonitor()},!1);