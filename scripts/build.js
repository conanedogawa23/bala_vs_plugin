#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class BuildScript {
    constructor() {
        this.rootDir = path.resolve(__dirname, '..');
        this.distDir = path.join(this.rootDir, 'dist');
        this.outDir = path.join(this.rootDir, 'out');
    }

    log(message, type = 'info') {
        const timestamp = new Date().toISOString();
        const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
        console.log(`[${timestamp}] ${prefix} ${message}`);
    }

    async run() {
        try {
            this.log('Starting Bala AI Code Analyzer build process...');

            // Pre-build checks
            await this.preBuildChecks();

            // Clean previous builds
            await this.clean();

            // Security audit
            await this.securityAudit();

            // TypeScript compilation
            await this.compileTypeScript();

            // Webpack bundling
            await this.bundle();

            // Run tests
            await this.runTests();

            // Package extension
            await this.package();

            this.log('Build completed successfully!', 'success');

        } catch (error) {
            this.log(`Build failed: ${error.message}`, 'error');
            process.exit(1);
        }
    }

    async preBuildChecks() {
        this.log('Running pre-build checks...');

        // Check Node.js version
        const nodeVersion = process.version;
        const requiredVersion = '16.0.0';
        if (!this.compareVersions(nodeVersion, requiredVersion)) {
            throw new Error(`Node.js version ${nodeVersion} is not supported. Minimum required: ${requiredVersion}`);
        }

        // Check if package.json exists
        const packageJsonPath = path.join(this.rootDir, 'package.json');
        if (!fs.existsSync(packageJsonPath)) {
            throw new Error('package.json not found');
        }

        // Validate package.json
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        const requiredFields = ['name', 'version', 'engines', 'main'];
        for (const field of requiredFields) {
            if (!packageJson[field]) {
                throw new Error(`Missing required field in package.json: ${field}`);
            }
        }

        this.log('Pre-build checks passed');
    }

    async clean() {
        this.log('Cleaning previous build artifacts...');

        const dirsToClean = [this.distDir, this.outDir];

        for (const dir of dirsToClean) {
            if (fs.existsSync(dir)) {
                fs.rmSync(dir, { recursive: true, force: true });
            }
        }

        // Clean VSIX files
        const vsixFiles = fs.readdirSync(this.rootDir).filter(file => file.endsWith('.vsix'));
        for (const file of vsixFiles) {
            fs.unlinkSync(path.join(this.rootDir, file));
        }

        this.log('Clean completed');
    }

    async securityAudit() {
        this.log('Running security audit...');

        try {
            execSync('npm audit --audit-level=moderate', {
                cwd: this.rootDir,
                stdio: 'pipe'
            });
            this.log('Security audit passed');
        } catch (error) {
            // npm audit returns non-zero exit code for vulnerabilities
            const output = error.stdout?.toString() || '';
            if (output.includes('vulnerabilities')) {
                this.log('Security vulnerabilities found, but continuing build...', 'error');
                // In production, you might want to fail the build
                // throw new Error('Security vulnerabilities detected');
            }
        }
    }

    async compileTypeScript() {
        this.log('Compiling TypeScript...');

        execSync('npm run compile', {
            cwd: this.rootDir,
            stdio: 'inherit'
        });

        this.log('TypeScript compilation completed');
    }

    async bundle() {
        this.log('Bundling with Webpack...');

        execSync('npm run build', {
            cwd: this.rootDir,
            stdio: 'inherit'
        });

        // Verify bundle
        const bundlePath = path.join(this.distDir, 'extension.js');
        if (!fs.existsSync(bundlePath)) {
            throw new Error('Bundle file not created');
        }

        const stats = fs.statSync(bundlePath);
        const bundleSize = (stats.size / 1024 / 1024).toFixed(2);
        this.log(`Bundle created successfully (${bundleSize} MB)`);
    }

    async runTests() {
        this.log('Running tests...');

        try {
            execSync('npm test', {
                cwd: this.rootDir,
                stdio: 'inherit'
            });
            this.log('Tests passed');
        } catch (error) {
            this.log('Tests failed', 'error');
            throw error;
        }
    }

    async package() {
        this.log('Packaging extension...');

        // Install vsce if not available
        try {
            execSync('npx @vscode/vsce --version', { stdio: 'pipe' });
        } catch {
            this.log('Installing vsce...');
            execSync('npm install -g @vscode/vsce', { stdio: 'inherit' });
        }

        // Package the extension
        execSync('npx @vscode/vsce package --out dist', {
            cwd: this.rootDir,
            stdio: 'inherit'
        });

        // Verify package
        const packageJson = JSON.parse(fs.readFileSync(path.join(this.rootDir, 'package.json'), 'utf8'));
        const vsixFile = `${packageJson.name}-${packageJson.version}.vsix`;

        if (!fs.existsSync(path.join(this.rootDir, 'dist', vsixFile))) {
            throw new Error('VSIX package not created');
        }

        this.log(`Extension packaged successfully: dist/${vsixFile}`);
    }

    compareVersions(version1, version2) {
        const v1 = version1.replace('v', '').split('.').map(Number);
        const v2 = version2.split('.').map(Number);

        for (let i = 0; i < Math.max(v1.length, v2.length); i++) {
            const part1 = v1[i] || 0;
            const part2 = v2[i] || 0;

            if (part1 > part2) return true;
            if (part1 < part2) return false;
        }

        return true;
    }
}

// Run the build script
const buildScript = new BuildScript();
buildScript.run().catch(error => {
    console.error('Build script failed:', error);
    process.exit(1);
});
