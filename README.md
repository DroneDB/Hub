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

## License

The Hub is **source-available** under the [DroneDB Source-Available License 1.0](LICENSE.md).

- Free for personal use, for teaching at non-profit educational institutions, for research that a non-profit institution does on its own account and publishes, and for a 60-day evaluation by anyone.
- Companies (including sole traders and freelancers), public bodies and anyone using the Hub for paid work need a [commercial licence](COMMERCIAL.md) for production use.
- You may not change the source code or distribute copies. Settings, configuration, deployment files and branding through the settings are not changes.

Third-party components keep their own licences: see [NOTICE.md](NOTICE.md). Releases before 3.0.0 stay under the terms they were published with.

Contributions need the Contributor License Agreement: see [CONTRIBUTING.md](CONTRIBUTING.md).
