# Hub
JS Client Application for Registry

![image](https://user-images.githubusercontent.com/1951843/101946775-6be59d80-3bbd-11eb-8895-df5a29e47e3f.png)

## Build

Before building, make sure you are using Node.js version 16.x, which is required for this project:

```
# git clone https://github.com/DroneDB/Hub --recurse-submodules && cd Hub
# nvm use 16
# npm install -g webpack@4
# npm install
# npx webpack
```

Note: The project uses Vue.js 2.6.11 and is configured to be built with webpack 4, which works best with Node.js 16.x.

## Run

```
cd build
python -m http.server 8080
```

Open a web browser to http://localhost:8080
