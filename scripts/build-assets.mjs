import { cp, mkdir, rm } from 'node:fs/promises';

await rm('vendor', { recursive: true, force: true });
await mkdir('vendor', { recursive: true });
await cp('node_modules/bootstrap/dist', 'vendor/bootstrap', { recursive: true });
await cp('node_modules/bootstrap-icons/font', 'vendor/bootstrap-icons', { recursive: true });
await mkdir('apps/timing', { recursive: true });
await cp('index.html', 'apps/timing/index.html');
