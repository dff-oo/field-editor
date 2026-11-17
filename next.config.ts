import type { NextConfig } from 'next';

/** Set to /field-editor for the GitHub Pages build, which is served from that subpath. */
const basePath = process.env.BASE_PATH ?? '';

const nextConfig: NextConfig = {
  output: 'export',
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  agentRules: false,
  /** Omnia UI ships TypeScript and CSS Modules source. */
  transpilePackages: ['@dffoogg/omnia-ui'],
};

export default nextConfig;
