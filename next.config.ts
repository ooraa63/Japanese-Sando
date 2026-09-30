import type { NextConfig } from "next";

/**
 * Host yang boleh dipakai next/image. Foto produk & QRIS diunggah ke
 * Supabase Storage, jadi domain project perlu diizinkan di sini.
 * Kalau project Supabase diganti, update juga URL ini.
 */
const SUPABASE_HOST = "xuavxcfnkqcszdacpwpo.supabase.co";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: SUPABASE_HOST,
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: SUPABASE_HOST,
        pathname: "/storage/v1/object/sign/**",
      },
    ],
  },
  // Nonaktifkan banner powered-by yang tidak perlu.
  poweredByHeader: false,
};

export default nextConfig;
