// StudyInk.app: a native window around StudyInk's local server.
//
// The app starts the notebook's own server (Next.js standalone, run by the Node binary bundled
// next to this executable) as a child process and shows the book in a WebKit window. Your
// study book lives in this app's WebKit storage; your slides go no further than this Mac:
// the bundled server, the Python slide reader, and Gemma in Ollama. On quit it stops the server
// and asks Ollama to unload the model, so nothing is left holding memory.
import Cocoa
import WebKit

final class AppDelegate: NSObject, NSApplicationDelegate, WKUIDelegate, WKNavigationDelegate, WKDownloadDelegate, WKScriptMessageHandler {
    var window: NSWindow!
    var web: WKWebView!
    var server: Process?
    var log: FileHandle?
    var downloads: [ObjectIdentifier: URL] = [:]

    func info(_ key: String) -> String? { Bundle.main.object(forInfoDictionaryKey: key) as? String }

    // A fixed port: the book is stored per origin, so it must be the same address every launch.
    lazy var port: Int = Int(info("StudyInkPort") ?? "") ?? 8795
    var base: URL { URL(string: "http://127.0.0.1:\(port)/")! }

    // ~/Library/Application Support/StudyInk holds the server log and optional settings (studyink.env)
    lazy var home: URL = {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("StudyInk")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }()

    /// Model settings: baked in at build time, overridable by KEY=VALUE lines in studyink.env.
    lazy var settings: [String: String] = {
        var s = [
            "LLM_PROVIDER": info("StudyInkProvider") ?? "ollama",
            "LLM_BASE_URL": info("StudyInkOllama") ?? "http://127.0.0.1:11434",
            "LLM_MODEL": info("StudyInkModel") ?? "gemma4:e4b",
            "PYTHON": info("StudyInkPython") ?? "/usr/bin/python3",
        ]
        let file = home.appendingPathComponent("studyink.env")
        if let text = try? String(contentsOf: file, encoding: .utf8) {
            for line in text.split(whereSeparator: \.isNewline) {
                let t = line.trimmingCharacters(in: .whitespaces)
                guard !t.hasPrefix("#"), let eq = t.firstIndex(of: "=") else { continue }
                let key = String(t[..<eq]).trimmingCharacters(in: .whitespaces)
                let value = String(t[t.index(after: eq)...]).trimmingCharacters(in: .whitespaces).trimmingCharacters(in: CharacterSet(charactersIn: "\"'"))
                if !key.isEmpty { s[key] = value }
            }
        } else {
            let sample = """
            # StudyInk settings. Uncomment a line to change it, then quit and reopen StudyInk.
            # LLM_MODEL=\(s["LLM_MODEL"]!)
            # LLM_BASE_URL=\(s["LLM_BASE_URL"]!)
            # PYTHON=\(s["PYTHON"]!)
            """
            try? sample.write(to: file, atomically: true, encoding: .utf8)
        }
        return s
    }()

    func applicationDidFinishLaunching(_ note: Notification) {
        buildMenu()
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default() // persistent: the study book survives restarts
        // WebKit ignores window.print(); hand it to the native print panel instead
        let printHook = WKUserScript(source: "window.print = () => window.webkit.messageHandlers.print.postMessage(null);",
                                     injectionTime: .atDocumentStart, forMainFrameOnly: true)
        config.userContentController.addUserScript(printHook)
        config.userContentController.add(self, name: "print")
        web = WKWebView(frame: .zero, configuration: config)
        web.uiDelegate = self
        web.navigationDelegate = self
        web.allowsMagnification = true
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1320, height: 880),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable],
                          backing: .buffered, defer: false)
        window.title = "StudyInk"
        window.contentView = web
        window.minSize = NSSize(width: 820, height: 600)
        window.backgroundColor = NSColor(red: 0.23, green: 0.18, blue: 0.15, alpha: 1)
        window.center()
        window.setFrameAutosaveName("StudyInkMain")
        window.makeKeyAndOrderFront(nil)
        web.loadHTMLString(Self.loadingPage, baseURL: nil)
        startOllamaIfNeeded()
        startServer()
        waitForServer(tries: 120)
        NSApp.activate(ignoringOtherApps: true)
    }

    // ── the server ──────────────────────────────────────────────────────────
    func startServer() {
        guard let app = Bundle.main.resourceURL?.appendingPathComponent("app"),
              let node = Bundle.main.url(forAuxiliaryExecutable: "node") else {
            return fail("This copy of StudyInk is incomplete (the bundled server is missing). Rebuild it with packaging/build_app.sh.")
        }
        let p = Process()
        p.executableURL = node
        p.arguments = [app.appendingPathComponent("server.js").path]
        p.currentDirectoryURL = app
        var env = ProcessInfo.processInfo.environment
        // apps don't get the shell's PATH; LibreOffice's soffice and Homebrew live here
        env["PATH"] = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/Applications/LibreOffice.app/Contents/MacOS"
        env["PORT"] = String(port)
        env["HOSTNAME"] = "127.0.0.1"
        env["NODE_ENV"] = "production"
        env["NEXT_TELEMETRY_DISABLED"] = "1"
        for (k, v) in settings { env[k] = v }
        p.environment = env
        let logURL = home.appendingPathComponent("server.log")
        FileManager.default.createFile(atPath: logURL.path, contents: nil)
        if let h = try? FileHandle(forWritingTo: logURL) {
            p.standardOutput = h
            p.standardError = h
            log = h
        }
        do {
            try p.run()
            server = p
        } catch {
            fail("StudyInk's server could not start: \(error.localizedDescription)")
        }
    }

    func waitForServer(tries: Int) {
        var req = URLRequest(url: base)
        req.timeoutInterval = 1
        URLSession.shared.dataTask(with: req) { _, resp, _ in
            DispatchQueue.main.async {
                if (resp as? HTTPURLResponse)?.statusCode == 200 {
                    self.web.load(URLRequest(url: self.base))
                } else if tries > 0 && self.server?.isRunning == true {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { self.waitForServer(tries: tries - 1) }
                } else {
                    self.fail("StudyInk's server did not start. Details are in \(self.home.path)/server.log")
                }
            }
        }.resume()
    }

    /// Gemma lives in Ollama. If it's installed but not running, start it quietly in the background.
    func startOllamaIfNeeded() {
        guard settings["LLM_PROVIDER"] == "ollama", let url = URL(string: settings["LLM_BASE_URL"] ?? ""),
              ["127.0.0.1", "localhost"].contains(url.host ?? "") else { return }
        var req = URLRequest(url: url.appendingPathComponent("api/version"))
        req.timeoutInterval = 1.5
        URLSession.shared.dataTask(with: req) { _, resp, _ in
            guard (resp as? HTTPURLResponse)?.statusCode != 200 else { return }
            DispatchQueue.main.async {
                let candidates = ["/Applications/Ollama.app", NSHomeDirectory() + "/Applications/Ollama.app"]
                guard let path = candidates.first(where: { FileManager.default.fileExists(atPath: $0) }) else { return }
                let cfg = NSWorkspace.OpenConfiguration()
                cfg.activates = false
                cfg.hides = true
                NSWorkspace.shared.openApplication(at: URL(fileURLWithPath: path), configuration: cfg)
            }
        }.resume()
    }

    /// Stop the server, then ask Ollama to let go of the model (it's several GB of memory).
    func stopServer() {
        if let p = server, p.isRunning {
            p.terminate()
            let deadline = Date().addingTimeInterval(5)
            while p.isRunning && Date() < deadline { Thread.sleep(forTimeInterval: 0.1) }
            if p.isRunning { kill(p.processIdentifier, SIGKILL) }
        }
        try? log?.close()
        guard settings["LLM_PROVIDER"] == "ollama", let url = URL(string: settings["LLM_BASE_URL"] ?? "") else { return }
        var req = URLRequest(url: url.appendingPathComponent("api/generate"))
        req.httpMethod = "POST"
        req.timeoutInterval = 3
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["model": settings["LLM_MODEL"] ?? "", "keep_alive": 0])
        let done = DispatchSemaphore(value: 0)
        URLSession.shared.dataTask(with: req) { _, _, _ in done.signal() }.resume()
        _ = done.wait(timeout: .now() + 4)
    }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard web != nil, server?.isRunning == true else {
            stopServer()
            return .terminateNow
        }
        web.evaluateJavaScript("window.studyinkBusy || 0") { result, _ in
            var quit = true
            if let busy = result as? Int, busy > 0 {
                let a = NSAlert()
                a.messageText = "A chapter is being written"
                a.informativeText = "Quit anyway? Gemma stops now and picks up where it left off the next time you open StudyInk."
                a.addButton(withTitle: "Quit")
                a.addButton(withTitle: "Keep writing")
                quit = a.runModal() == .alertFirstButtonReturn
            }
            if quit { self.stopServer() }
            NSApp.reply(toApplicationShouldTerminate: quit)
        }
        return .terminateLater
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func fail(_ message: String) {
        let a = NSAlert()
        a.messageText = "StudyInk"
        a.informativeText = message
        a.runModal()
    }

    // ── menu ────────────────────────────────────────────────────────────────
    func buildMenu() {
        let main = NSMenu()
        let appItem = NSMenuItem(); main.addItem(appItem)
        let app = NSMenu()
        app.addItem(withTitle: "About StudyInk", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        app.addItem(.separator())
        app.addItem(withTitle: "Settings File…", action: #selector(openSettings), keyEquivalent: ",")
        app.addItem(withTitle: "Show Server Log", action: #selector(openLog), keyEquivalent: "")
        app.addItem(.separator())
        app.addItem(withTitle: "Hide StudyInk", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        app.addItem(withTitle: "Quit StudyInk", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = app
        let editItem = NSMenuItem(); main.addItem(editItem)
        let edit = NSMenu(title: "Edit")
        edit.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        edit.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
        edit.addItem(.separator())
        edit.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = edit
        let viewItem = NSMenuItem(); main.addItem(viewItem)
        let view = NSMenu(title: "View")
        view.addItem(withTitle: "Reload", action: #selector(reload), keyEquivalent: "r")
        view.addItem(.separator())
        view.addItem(withTitle: "Actual Size", action: #selector(zoomReset), keyEquivalent: "0")
        view.addItem(withTitle: "Zoom In", action: #selector(zoomIn), keyEquivalent: "=")
        view.addItem(withTitle: "Zoom Out", action: #selector(zoomOut), keyEquivalent: "-")
        view.addItem(.separator())
        let full = view.addItem(withTitle: "Enter Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        full.keyEquivalentModifierMask = [.command, .control]
        viewItem.submenu = view
        let winItem = NSMenuItem(); main.addItem(winItem)
        let win = NSMenu(title: "Window")
        win.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        win.addItem(withTitle: "Close", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        winItem.submenu = win
        NSApp.mainMenu = main
        NSApp.windowsMenu = win
    }

    @objc func reload() { web.load(URLRequest(url: base)) }
    @objc func openSettings() {
        _ = settings // writes the sample file the first time
        NSWorkspace.shared.open(home.appendingPathComponent("studyink.env"))
    }
    @objc func openLog() { NSWorkspace.shared.open(home.appendingPathComponent("server.log")) }
    @objc func zoomReset() { web.pageZoom = 1 }
    @objc func zoomIn() { web.pageZoom = min(2, web.pageZoom + 0.1) }
    @objc func zoomOut() { web.pageZoom = max(0.6, web.pageZoom - 0.1) }

    // ── web view plumbing ───────────────────────────────────────────────────

    // <input type=file>: "Add a lecture" and "bring one back"
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseDirectories = false
        panel.message = "Choose a lecture deck (.pptx or .pdf)"
        panel.beginSheetModal(for: window) { r in completionHandler(r == .OK ? panel.urls : nil) }
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let a = NSAlert()
        a.messageText = message
        a.beginSheetModal(for: window) { _ in completionHandler() }
    }

    // "Tear this chapter out?"
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let a = NSAlert()
        a.messageText = message
        a.addButton(withTitle: "OK")
        a.addButton(withTitle: "Cancel")
        a.beginSheetModal(for: window) { r in completionHandler(r == .alertFirstButtonReturn) }
    }

    // links meant for a new tab (the course page on the LMS) open in the default browser
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let u = navigationAction.request.url { NSWorkspace.shared.open(u) }
        return nil
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if navigationAction.shouldPerformDownload { return decisionHandler(.download) }
        // anything that isn't the book itself belongs in the browser
        if let u = navigationAction.request.url, ["http", "https"].contains(u.scheme ?? ""), u.host != "127.0.0.1",
           navigationAction.targetFrame?.isMainFrame == true {
            NSWorkspace.shared.open(u)
            return decisionHandler(.cancel)
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        decisionHandler(navigationResponse.canShowMIMEType ? .allow : .download)
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }

    // "Download my study book": saved to Downloads and shown in Finder
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String,
                  completionHandler: @escaping (URL?) -> Void) {
        let folder = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask)[0]
        let name = (suggestedFilename as NSString).deletingPathExtension
        let ext = (suggestedFilename as NSString).pathExtension
        var dest = folder.appendingPathComponent(suggestedFilename)
        var n = 2
        while FileManager.default.fileExists(atPath: dest.path) {
            dest = folder.appendingPathComponent("\(name) \(n)" + (ext.isEmpty ? "" : ".\(ext)"))
            n += 1
        }
        downloads[ObjectIdentifier(download)] = dest
        completionHandler(dest)
    }

    func downloadDidFinish(_ download: WKDownload) {
        if let dest = downloads.removeValue(forKey: ObjectIdentifier(download)) {
            NSWorkspace.shared.activateFileViewerSelecting([dest])
        }
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        downloads.removeValue(forKey: ObjectIdentifier(download))
        fail("The download didn't finish: \(error.localizedDescription)")
    }

    // "Print it": a chapter, through the native print panel (and Save as PDF)
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "print" else { return }
        let info = NSPrintInfo.shared.copy() as! NSPrintInfo
        info.topMargin = 36
        info.bottomMargin = 36
        info.leftMargin = 36
        info.rightMargin = 36
        info.isVerticallyCentered = false
        let op = web.printOperation(with: info)
        op.view?.frame = web.bounds
        op.runModal(for: window, delegate: nil, didRun: nil, contextInfo: nil)
    }

    static let loadingPage = """
    <html><body style="margin:0;background:#3b2f27;color:#fbf7ec;font:16px -apple-system;display:grid;place-items:center;height:100vh">
    <div style="text-align:center"><div style="font:italic 700 42px Georgia,serif;letter-spacing:.5px">StudyInk</div>
    <div style="color:#d9c9b4;margin-top:10px">opening the book…</div></div></body></html>
    """
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
