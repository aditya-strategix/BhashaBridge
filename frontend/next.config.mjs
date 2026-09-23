/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // Disabled: StrictMode double-mounts effects, causing duplicate socket connections in meetings
};

export default nextConfig;
