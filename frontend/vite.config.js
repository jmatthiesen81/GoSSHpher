// Vite empties dist/ before every build. dist/ must still exist in a fresh
// clone (main.go embeds it with go:embed), so git tracks only a .gitignore in
// it; this plugin writes that file again after each build.
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const distGitignore = {
    name: 'keep-dist-gitignore',
    apply: 'build',
    closeBundle() {
        writeFileSync(resolve(import.meta.dirname, 'dist/.gitignore'), '/*\n!/.gitignore\n');
    },
};

export default {
    plugins: [distGitignore],
    test: {
        environment: 'jsdom',
        include: ['test/**/*.test.js'],
    },
};
