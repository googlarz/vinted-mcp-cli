import { createRequire } from 'node:module';

export const VERSION: string = (createRequire(import.meta.url)('../package.json') as { version: string }).version;
