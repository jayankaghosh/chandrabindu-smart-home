// Expo config plugin — adopt the iOS UIScene lifecycle.
//
// iOS 26 fatally rejects apps that don't adopt the scene lifecycle
// (`_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption` → SIGTRAP at
// launch). The Expo/React Native template still creates its UIWindow in the app
// delegate, so we must (1) declare a scene configuration in Info.plist and
// (2) add a SceneDelegate that hands the app delegate's React Native window to
// the scene — otherwise the scene shows its own empty (black) window.
const { withInfoPlist, withAppDelegate } = require("@expo/config-plugins");

const SCENE_DELEGATE_SWIFT = `

// Added by withIOSSceneLifecycle: adopt the UIScene lifecycle (required by iOS 26)
// while keeping the React Native window that AppDelegate creates.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else { return }
    if let appDelegate = UIApplication.shared.delegate as? AppDelegate,
       let rnWindow = appDelegate.window {
      rnWindow.windowScene = windowScene
      self.window = rnWindow
      rnWindow.makeKeyAndVisible()
    } else {
      let newWindow = UIWindow(windowScene: windowScene)
      self.window = newWindow
      newWindow.makeKeyAndVisible()
    }
  }
}
`;

function withSceneDelegate(config) {
  return withAppDelegate(config, (cfg) => {
    if (!cfg.modResults.contents.includes("class SceneDelegate")) {
      cfg.modResults.contents = cfg.modResults.contents.trimEnd() + "\n" + SCENE_DELEGATE_SWIFT;
    }
    return cfg;
  });
}

function withSceneManifest(config) {
  return withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: "Default Configuration",
            UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate",
          },
        ],
      },
    };
    return cfg;
  });
}

module.exports = function withIOSSceneLifecycle(config) {
  config = withSceneManifest(config);
  config = withSceneDelegate(config);
  return config;
};
