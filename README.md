# Hub
JS Client Application for Registry

![image](https://user-images.githubusercontent.com/1951843/101946775-6be59d80-3bbd-11eb-8895-df5a29e47e3f.png)

## Build

Prima di buildare, assicurati di utilizzare Node.js versione 14.x, che è richiesta per questo progetto:

```
# git clone https://github.com/DroneDB/Hub --recurse-submodules && cd Hub
# nvm use 14        # Il file .nvmrc è già configurato con la versione 14.17.0
# npm install -g webpack@4
# npm install
# npx webpack
```

Nota: Il progetto utilizza Vue.js 2.6.11 ed è configurato per essere buildato con webpack 4, che funziona meglio con Node.js 14.x.

## Run

```
cd build
python -m http.server 8080
```

Open a web browser to http://localhost:8080
