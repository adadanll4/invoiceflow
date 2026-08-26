import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb", 
    },
  },
};
{/* this is where we config the size limit of the pic receipt uploaded  */}
export default nextConfig;