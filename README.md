# Hub

JS Client Application for Registry

![image](https://user-images.githubusercontent.com/1951843/101946775-6be59d80-3bbd-11eb-8895-df5a29e47e3f.png)

## Build

The project needs Node.js 20.19 or later (`engines` in `package.json`: the lint and test tools do not run on older versions). The Registry's CI builds with Node.js 24.

```bash
git clone https://github.com/DroneDB/Hub && cd Hub
npm install
npm run build
```

`npm run build:prod` builds the production bundle (minified, with the `.br` and `.gz` twins the Registry serves).

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
