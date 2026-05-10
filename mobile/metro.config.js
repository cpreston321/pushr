// Learn more https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);

// Let Metro watch the pushr root so we can import ../convex/_generated/api.
// We *append* rather than replace so expo-doctor's "watchFolders includes all
// Expo defaults" check passes — Expo's default list seeds entries we want to
// keep alongside our monorepo extension.
config.watchFolders = [...(config.watchFolders ?? []), workspaceRoot];

// Resolve modules from both mobile/ and pushr/ node_modules to avoid duplicates
config.resolver.nodeModulesPaths = [
  ...(config.resolver.nodeModulesPaths ?? []),
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.disableHierarchicalLookup = false;

module.exports = config;
