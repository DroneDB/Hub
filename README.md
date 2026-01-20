# Hub
JS Client Application for Registry

![image](https://user-images.githubusercontent.com/1951843/101946775-6be59d80-3bbd-11eb-8895-df5a29e47e3f.png)

## Build

The project is compatible with Node.js 18+ (recommended: 22.x LTS).

```bash
git clone https://github.com/DroneDB/Hub --recurse-submodules && cd Hub
npm install
npm run build
```

### Alternative: Direct webpack command

If you prefer to run webpack directly:

```bash
npm install
node --openssl-legacy-provider ./node_modules/webpack/bin/webpack.js
```

> **Note**: The `--openssl-legacy-provider` flag is required for Node.js 17+ due to OpenSSL 3.0 changes. The `npm run build` script handles this automatically.

## Run

```bash
cd build
python -m http.server 8080
```

Open a web browser to http://localhost:8080
