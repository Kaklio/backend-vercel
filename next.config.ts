import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium-min", "puppeteer-extra-plugin-stealth", "puppeteer-extra"],
};

export default nextConfig;