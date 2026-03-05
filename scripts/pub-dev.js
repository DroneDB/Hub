#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const dest = path.resolve(__dirname, '..', '..', 'registry-data', 'ClientApp');

try {
    execSync('npm run build', { stdio: 'inherit' });
    console.log('Build OK, publishing...');
} catch (e) {
    console.error('Build failed');
    process.exit(1);
}

function rm(dir) {
    if (fs.existsSync(dir)) {
        fs.readdirSync(dir).forEach(f => {
            const child = path.join(dir, f);
            fs.statSync(child).isDirectory() ? rm(child) : fs.unlinkSync(child);
        });
        fs.rmdirSync(dir);
    }
}

function cp(src, dst) {
    fs.mkdirSync(dst, { recursive: true });
    fs.readdirSync(src).forEach(f => {
        const s = path.join(src, f);
        const d = path.join(dst, f);
        fs.statSync(s).isDirectory() ? cp(s, d) : fs.copyFileSync(s, d);
    });
}

rm(dest);
cp(path.resolve(__dirname, '..', 'build'), dest);
console.log('Published to ' + dest);
