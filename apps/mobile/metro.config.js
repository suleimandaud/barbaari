const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [
  ...(config.watchFolders || []),
  workspaceRoot,
];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// The web apps in this monorepo use React 18 (hoisted to the root node_modules) while this
// app uses React 19 (apps/mobile/node_modules). Any package resolved from the root — e.g.
// react-native-web or @barbaari/shared — would otherwise find the root React 18 via normal
// hierarchical lookup, loading two Reacts and breaking hooks ("Invalid hook call"). Only
// these singletons are pinned to nodeModulesPaths (the mobile copy first); everything else
// keeps Metro's default resolution, which `expo-doctor` expects.
const SINGLETONS = ['react', 'react-dom'];

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (SINGLETONS.some((name) => moduleName === name || moduleName.startsWith(`${name}/`))) {
    return context.resolveRequest(
      { ...context, disableHierarchicalLookup: true },
      moduleName,
      platform,
    );
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
