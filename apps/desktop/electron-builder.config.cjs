const mode = process.env.POCKET_DESKTOP_MODE === "admin" ? "admin" : "pos";
const productName = mode === "admin" ? "Pocket Admin" : "Pocket POS";

module.exports = {
  appId: mode === "admin" ? "com.pocketpakistan.admin" : "com.pocketpakistan.pos",
  productName,
  directories: {
    output: `release/${mode}`
  },
  files: [
    "main.cjs",
    "preload.cjs",
    "package.json"
  ],
  extraMetadata: {
    name: mode === "admin" ? "pocket-admin" : "pocket-pos",
    productName,
    pocketDesktopMode: mode
  },
  // Stable names let the website always link to the newest GitHub release.
  artifactName: `${productName.replaceAll(" ", "-")}-Setup.${"${ext}"}`,
  win: {
    target: [
      {
        target: "nsis",
        arch: ["x64"]
      }
    ]
  },
  mac: {
    target: [
      {
        target: "dmg",
        arch: ["universal"]
      }
    ]
  },
  linux: {
    target: [
      {
        target: "AppImage",
        arch: ["x64"]
      }
    ]
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true
  }
};
