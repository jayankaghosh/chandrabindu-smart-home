import AppKit
import UniformTypeIdentifiers
import WebKit

/// The complete web app in a native window, for everything that doesn't belong
/// in a quick-control panel (builders, usage, insights, settings, voice).
/// The panel's session token is handed over as the `shc_session` cookie, so
/// there is no second sign-in.
@MainActor
final class FullAppWindowController: NSWindowController, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    private let webView: WKWebView
    private let base: String
    var onClose: (() -> Void)?

    init(base: String, token: String?, title: String) {
        self.base = base
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        webView = WKWebView(frame: .zero, configuration: config)
        webView.allowsBackForwardNavigationGestures = true

        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1180, height: 820),
                              styleMask: [.titled, .closable, .miniaturizable, .resizable],
                              backing: .buffered, defer: false)
        window.title = title
        window.contentView = webView
        window.isReleasedWhenClosed = false
        window.minSize = NSSize(width: 420, height: 500)
        window.center()
        window.setFrameAutosaveName("ChandrabinduFullApp")
        super.init(window: window)
        window.delegate = self
        webView.navigationDelegate = self
        webView.uiDelegate = self
        load(token: token)
    }

    required init?(coder: NSCoder) { fatalError("not used") }

    func load(token: String?) {
        guard let url = URL(string: base + "/") else { return }
        guard let token, let host = url.host,
              let cookie = HTTPCookie(properties: [
                  .name: "shc_session", .value: token, .domain: host, .path: "/",
                  .expires: Date().addingTimeInterval(60 * 60 * 24 * 365),
              ]) else {
            webView.load(URLRequest(url: url))
            return
        }
        webView.configuration.websiteDataStore.httpCookieStore.setCookie(cookie) { [weak self] in
            self?.webView.load(URLRequest(url: url))
        }
    }

    func reload() { webView.reload() }

    func windowWillClose(_ notification: Notification) { onClose?() }

    // MARK: Navigation

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        showOffline(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        showOffline(error)
    }

    private func showOffline(_ error: Error) {
        let code = (error as NSError).code
        guard code != NSURLErrorCancelled, code != 102 /* frame load interrupted (download) */ else { return }
        let html = """
        <!doctype html><html><head><meta charset="utf-8"><style>
        :root { color-scheme: light dark; }
        body { font: 14px -apple-system, system-ui; display:flex; align-items:center; justify-content:center;
               height:100vh; margin:0; background: Canvas; color: CanvasText; }
        .card { text-align:center; max-width: 380px; }
        .icon { font-size: 44px; } h1 { font-size: 20px; margin: 12px 0 6px; }
        p { color: GrayText; line-height: 1.45; }
        button { margin-top: 14px; font: inherit; padding: 8px 18px; border-radius: 8px; border: 0;
                 background: #6661f2; color: white; cursor: pointer; }
        code { font-size: 12px; color: GrayText; }
        </style></head><body><div class="card">
        <div class="icon">📶</div><h1>Can't reach your home</h1>
        <p>Chandrabindu runs on your home network, so it only works when this Mac is on your home Wi-Fi.</p>
        <code>\(base)</code><br>
        <button onclick="location.href='\(base)/'">Try again</button>
        </div></body></html>
        """
        webView.loadHTMLString(html, baseURL: nil)
    }

    // Attachments (e.g. the .cnbdu backup) become downloads instead of blank pages.
    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse,
                 decisionHandler: @escaping @MainActor (WKNavigationResponsePolicy) -> Void) {
        let disposition = (navigationResponse.response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Disposition") ?? ""
        if disposition.lowercased().contains("attachment") || !navigationResponse.canShowMIMEType {
            decisionHandler(.download)
        } else {
            decisionHandler(.allow)
        }
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String,
                  completionHandler: @escaping @MainActor (URL?) -> Void) {
        let downloads = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask)[0]
        var target = downloads.appendingPathComponent(suggestedFilename)
        var n = 1
        while FileManager.default.fileExists(atPath: target.path) {
            let stem = (suggestedFilename as NSString).deletingPathExtension
            let ext = (suggestedFilename as NSString).pathExtension
            target = downloads.appendingPathComponent("\(stem) \(n)\(ext.isEmpty ? "" : "." + ext)")
            n += 1
        }
        completionHandler(target)
    }

    func downloadDidFinish(_ download: WKDownload) {
        NSSound(named: "Glass")?.play()
    }

    // MARK: UI (the web app uses confirm(), alert() and file pickers)

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping @MainActor () -> Void) {
        let alert = NSAlert()
        alert.messageText = message
        alert.addButton(withTitle: "OK")
        alert.runModal()
        completionHandler()
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping @MainActor (Bool) -> Void) {
        let alert = NSAlert()
        alert.messageText = message
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Cancel")
        completionHandler(alert.runModal() == .alertFirstButtonReturn)
    }

    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping @MainActor ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseDirectories = parameters.allowsDirectories
        panel.canChooseFiles = true
        panel.begin { result in completionHandler(result == .OK ? panel.urls : nil) }
    }

    // target=_blank links open in the same window.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if navigationAction.targetFrame == nil { webView.load(navigationAction.request) }
        return nil
    }

    // Voice mode asks for the microphone.
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
                 decisionHandler: @escaping @MainActor (WKPermissionDecision) -> Void) {
        decisionHandler(.prompt)
    }
}
