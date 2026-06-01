import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "@google-cloud/tasks"],
};

export default nextConfig;
