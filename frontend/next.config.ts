import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  images: {
    domains: [
      "tiru-chatapp.s3.ap-south-1.amazonaws.com",
      "streamly-uploads.s3.us-east-1.amazonaws.com"
    ], 
  }
};

export default nextConfig;

