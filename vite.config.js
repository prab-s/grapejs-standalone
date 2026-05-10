import { defineConfig } from 'vite';
import savePlugin from './save-plugin.js';

export default defineConfig({
    server: {
        allowedHosts: ['all', 'xps.local', 't1.bitrep.nz' ,'*'],
    },
    plugins: [savePlugin()],
});
