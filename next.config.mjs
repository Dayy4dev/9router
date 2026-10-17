import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import fs, { readFileSync } from "node:fs";
import fsPromises from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)));
const userHome = resolve(homedir());

// --- WINDOWS HOME DIRECTORY SCAN BLOCKER ---
// Hanya blokir folder sistem/user Windows di C:\Users\<user> yang bikin EPERM & Out of Memory,
// tapi tetap izinkan node_modules dan folder project.
const projectRootLower = projectRoot.toLowerCase();
const userHomeLower = userHome.toLowerCase();

// Daftar folder di C:\Users\<user> yang TIDAK BOLEH di-scan oleh Next.js / Webpack
const blockedUserDirs = [
  "appdata",
  "application data",
  "local settings",
  "my documents",
  "documents",
  "downloads",
  "desktop",
  "pictures",
  "videos",
  "music",
  "cookies",
  "nethood",
  "printhood",
  "recent",
  "sendto",
  "start menu",
  "templates",
  "onedrive",
  "saved games",
  "searches",
  "favorites",
  "contacts",
  "links",
  "3d objects",
  ".config",
  ".codex",
  ".vscode",
  ".cursor",
  ".npm",
  ".cache",
  ".local",
  ".ssh",
  ".git",
];

function shouldBlockDirScan(targetPath) {
  if (!targetPath) return false;
  const strPath =
    typeof targetPath === "string"
      ? targetPath
      : targetPath instanceof URL
        ? fileURLToPath(targetPath)
        : String(targetPath);
  const resolved = resolve(strPath).toLowerCase();

  // 1. Selalu izinkan semua yang ada di dalam projectRoot
  if (
    resolved === projectRootLower ||
    resolved.startsWith(projectRootLower + "\\") ||
    resolved.startsWith(projectRootLower + "/")
  ) {
    return false;
  }

  // 2. Blokir jika mencoba men-scan root C:\Users\dafi secara langsung
  if (resolved === userHomeLower) {
    return true;
  }

  // 3. Blokir jika masuk ke folder sistem/pribadi Windows di dalam C:\Users\dafi
  if (
    resolved.startsWith(userHomeLower + "\\") ||
    resolved.startsWith(userHomeLower + "/")
  ) {
    const relativeToHome = resolved.slice(userHomeLower.length + 1);
    const firstSegment = relativeToHome.split(/[\\/]/)[0];
    if (blockedUserDirs.includes(firstSegment)) {
      return true;
    }
  }

  return false;
}

const origReaddir = fs.readdir;
fs.readdir = function (path, options, callback) {
  if (typeof options === "function") {
    callback = options;
    options = undefined;
  }
  if (shouldBlockDirScan(path)) {
    return process.nextTick(() => callback(null, []));
  }
  const wrappedCallback = function (err, files) {
    if (err && (err.code === "EPERM" || err.code === "EACCES")) {
      return callback(null, []);
    }
    return callback(err, files);
  };
  return options !== undefined
    ? origReaddir.call(this, path, options, wrappedCallback)
    : origReaddir.call(this, path, wrappedCallback);
};

const origReaddirSync = fs.readdirSync;
fs.readdirSync = function (path, options) {
  if (shouldBlockDirScan(path)) {
    return [];
  }
  try {
    return origReaddirSync.call(this, path, options);
  } catch (err) {
    if (err && (err.code === "EPERM" || err.code === "EACCES")) {
      return [];
    }
    throw err;
  }
};

const origPromisesReaddir = fsPromises.readdir;
fsPromises.readdir = async function (path, options) {
  if (shouldBlockDirScan(path)) {
    return [];
  }
  try {
    return await origPromisesReaddir.call(this, path, options);
  } catch (err) {
    if (err && (err.code === "EPERM" || err.code === "EACCES")) {
      return [];
    }
    throw err;
  }
};
// --- END WINDOWS HOME DIRECTORY SCAN BLOCKER ---

function stampBuild() {
  const stamp = {};
  try {
    stamp.APP_REVISION = process.env.APP_REVISION
      || execFileSync("git", ["rev-parse", "HEAD"], { cwd: projectRoot, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    // Built outside a checkout: the release heading is the only anchor left.
  }
  try {
    const changelog = readFileSync(join(projectRoot, "CHANGELOG.md"), "utf8");
    const heading = changelog.match(/^#\s+(v[0-9][^\s(]*)/m);
    if (heading) stamp.APP_RELEASE = process.env.APP_RELEASE || heading[1].trim();
  } catch {
    // No changelog in the build context: the release signal stays unknown.
  }
  return stamp;
}

const parentDir = resolve(projectRoot, "..");
const tracingRoot =
  process.env.NEXT_TRACING_ROOT_MODE === "workspace" &&
  parentDir.toLowerCase() !== userHomeLower
    ? parentDir
    : projectRoot;

const EXTERNAL_PACKAGES = [
  "better-sqlite3",
  "sql.js",
  "node:sqlite",
  "bun:sqlite",
  "open",
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  output: "standalone",
  images: {
    unoptimized: true
  },
  env: stampBuild(),
  experimental: {
    outputFileTracingRoot: tracingRoot,
    outputFileTracingExcludes: {
      "*": [
        "./gitbook/**/*",
        "**/AppData/**",
        "**/Application Data/**",
        "**/.config/**",
        "**/.codex/**",
        "**/Cookies/**",
      ],
    },
    serverComponentsExternalPackages: EXTERNAL_PACKAGES,
    optimizePackageImports: ["@xyflow/react", "@dnd-kit/core", "@dnd-kit/sortable", "material-symbols", "marked"],
  },
  webpack: (config, { isServer }) => {
    // Ignore fs/path modules in browser bundle
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
      };
    }
    // Exclude non-source dirs from watcher to reduce inotify load
    config.watchOptions = {
      ...config.watchOptions,
      aggregateTimeout: 300,
      ignored: /[\\/](node_modules|\.git|logs|\.next|\.next-cli-build|gitbook|cli|open-sse\.old|tests|docs)[\\/]/,
    };
    // Pastikan semua EXTERNAL_PACKAGES ("better-sqlite3", "sql.js", "node:sqlite", "bun:sqlite", "open")
    // diperlakukan sebagai runtime external oleh Webpack agar tidak gagal saat build
    if (isServer) {
      config.externals = config.externals || [];
      for (const pkg of EXTERNAL_PACKAGES) {
        if (!config.externals.includes(pkg)) {
          config.externals.push(pkg);
        }
      }
    }
    return config;
  },
  async rewrites() {
    return [
      {
        source: "/v1/v1/:path*",
        destination: "/api/v1/:path*"
      },
      {
        source: "/v1/v1",
        destination: "/api/v1"
      },
      {
        source: "/codex/:path*",
        destination: "/api/v1/responses"
      },
      {
        source: "/responses",
        destination: "/api/v1/responses"
      },
      {
        source: "/systemone",
        destination: "/api/v1/systemone"
      },
      {
        source: "/v1beta/:path*",
        destination: "/api/v1beta/:path*"
      },
      {
        source: "/v1beta",
        destination: "/api/v1beta"
      },
      {
        source: "/v1/:path*",
        destination: "/api/v1/:path*"
      },
      {
        source: "/v1",
        destination: "/api/v1"
      }
    ];
  }
};

export default nextConfig;
