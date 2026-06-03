const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, "../../packages/shared");
const nodeModulesRoot = path.resolve(projectRoot, "node_modules");

const config = getDefaultConfig(projectRoot);

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  "@barbaari/shared": sharedRoot,
  expo: path.resolve(nodeModulesRoot, "expo"),
  react: path.resolve(nodeModulesRoot, "react"),
  "react-native": path.resolve(nodeModulesRoot, "react-native"),
};

module.exports = config;
