import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  output: "standalone",
  serverExternalPackages: ["exceljs"],
  outputFileTracingExcludes: {
    "*": [
      "./node_modules/exceljs/dist/**",
      "./node_modules/exceljs/**/*.md",
      "./node_modules/exceljs/index.ts",
      "./node_modules/@img/**",
      "./node_modules/sharp/**",
    ],
  },
};

export default nextConfig;
