import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.taildog.app",
  appName: "Taildog",
  // 网页版构建产物目录（与 vite build 输出一致）
  webDir: "dist",
  server: {
    // Android WebView 资源走本地 file://，无需远程服务器；
    // 熔丝服务器地址由应用内 Settings 或构建期 VITE_FUSE_SERVER 决定。
    androidScheme: "https",
  },
  android: {
    // 允许明文 http 熔丝地址（配合自托管 http 服务器时可不强制 https）
    allowMixedContent: true,
  },
};

export default config;
