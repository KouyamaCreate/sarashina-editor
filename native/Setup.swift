import AppKit
import Foundation

enum SetupError: LocalizedError {
    case message(String)
    var errorDescription: String? { if case .message(let s) = self { return s }; return nil }
}

struct Installer {
    let home: URL
    let payload: URL
    let fm = FileManager.default
    func enablePlugin(in original: String, id: String) throws -> String {
        let escaped = NSRegularExpression.escapedPattern(for: id)
        let target = try NSRegularExpression(pattern: "^\\s*\\[\\s*plugins\\s*\\.\\s*(?:\"\(escaped)\"|'\(escaped)')\\s*\\]\\s*(?:#.*)?$")
        var lines = original.components(separatedBy: "\n")
        let matches = lines.indices.filter { target.firstMatch(in: lines[$0], range: NSRange(lines[$0].startIndex..., in: lines[$0])) != nil }
        guard matches.count <= 1 else { throw SetupError.message("Codex設定に重複したプラグイン項目があります。上書きせず終了しました。") }
        if let start = matches.first {
            let end = lines.indices.dropFirst(start + 1).first { lines[$0].trimmingCharacters(in: .whitespaces).hasPrefix("[") } ?? lines.count
            let enabled = try NSRegularExpression(pattern: "^\\s*enabled\\s*=")
            let keys = (start + 1..<end).filter { enabled.firstMatch(in: lines[$0], range: NSRange(lines[$0].startIndex..., in: lines[$0])) != nil }
            guard keys.count <= 1 else { throw SetupError.message("プラグインのenabled設定が重複しています。") }
            if let index = keys.first { lines[index] = "enabled = true" }
            else { lines.insert("enabled = true", at: start + 1) }
            return lines.joined(separator: "\n")
        }
        guard !original.contains(id) else { throw SetupError.message("このプラグインは別形式で設定されています。既存設定を保持して終了しました。") }
        return original + "\n[plugins.\"\(id)\"]\nenabled = true\n"
    }
    func writeText(_ data: Data, to url: URL) throws {
        try fm.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        let temp = url.deletingLastPathComponent().appendingPathComponent(".sarashina-\(UUID().uuidString).tmp")
        defer { try? fm.removeItem(at: temp) }
        guard fm.createFile(atPath: temp.path, contents: data, attributes: [.posixPermissions: 0o600]) else { throw SetupError.message("設定を保存できませんでした。") }
        if fm.fileExists(atPath: url.path) { _ = try fm.replaceItemAt(url, withItemAt: temp) }
        else { try fm.moveItem(at: temp, to: url) }
    }
    func object(_ url: URL) throws -> [String: Any] {
        guard fm.fileExists(atPath: url.path) else { return [:] }
        guard let value = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any] else {
            throw SetupError.message("既存設定の形式が不正です。上書きせず終了しました。")
        }
        return value
    }
    func write(_ object: [String: Any], to url: URL) throws {
        try fm.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        let data = try JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes])
        let temp = url.deletingLastPathComponent().appendingPathComponent(".sarashina-\(UUID().uuidString).tmp")
        defer { try? fm.removeItem(at: temp) }
        guard fm.createFile(atPath: temp.path, contents: data, attributes: [.posixPermissions: 0o600]) else {
            throw SetupError.message("設定ファイルを保存できませんでした。")
        }
        if fm.fileExists(atPath: url.path) { _ = try fm.replaceItemAt(url, withItemAt: temp) }
        else { try fm.moveItem(at: temp, to: url) }
        try fm.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
    }
    func install(node: String, apiKey: String) throws -> String {
        let catalog = home.appendingPathComponent(".agents/plugins/marketplace.json")
        let keyFile = home.appendingPathComponent(".config/sarashina-editor/config.json")
        let destination = home.appendingPathComponent(".codex/plugins/sarashina-editor")
        let codexConfig = home.appendingPathComponent(".codex/config.toml")
        var market = try object(catalog)
        var settings = try object(keyFile)
        if !market.isEmpty && (!(market["name"] is String) || !(market["plugins"] is [[String: Any]])) {
            throw SetupError.message("既存の個人用プラグイン一覧を安全に更新できません。形式を確認してください。")
        }
        let server = payload.appendingPathComponent("server.cjs")
        guard fm.fileExists(atPath: server.path), fm.isExecutableFile(atPath: node) else {
            throw SetupError.message("サーバーまたはNode.jsが見つかりません。")
        }
        let key = apiKey.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !key.contains("\n"), !key.contains("\r") else { throw SetupError.message("APIキーに改行が含まれています。") }
        if market.isEmpty {
            market = ["name": "sarashina-editor-personal", "interface": ["displayName": "Sarashina Editor"], "plugins": []]
        }
        let oldConfig = fm.fileExists(atPath: codexConfig.path) ? try Data(contentsOf: codexConfig) : nil
        guard let originalConfig = oldConfig == nil ? "" : String(data: oldConfig!, encoding: .utf8) else { throw SetupError.message("Codex設定を読み込めません。") }
        guard let marketName = market["name"] as? String,
              marketName.range(of: "^[a-z0-9][a-z0-9_-]*$", options: .regularExpression) != nil else {
            throw SetupError.message("個人カタログ名の形式を確認してください。設定は変更していません。")
        }
        let pluginID = "sarashina-editor@\(marketName)"
        let newConfig = try enablePlugin(in: originalConfig, id: pluginID)
        var entries = market["plugins"] as? [[String: Any]] ?? []
        if let old = entries.first(where: { $0["name"] as? String == "sarashina-editor" }),
           let source = old["source"] as? [String: Any],
           source["path"] as? String != "./.codex/plugins/sarashina-editor" {
            throw SetupError.message("同じ名前の別プラグインが登録されています。上書きせず終了しました。")
        }
        entries.removeAll { $0["name"] as? String == "sarashina-editor" }
        entries.append(["name": "sarashina-editor", "source": ["source": "local", "path": "./.codex/plugins/sarashina-editor"],
                        "policy": ["installation": "AVAILABLE", "authentication": "ON_INSTALL"], "category": "Productivity"])
        market["plugins"] = entries
        let stamp = UUID().uuidString
        let staging = destination.deletingLastPathComponent().appendingPathComponent(".sarashina-stage-\(stamp)")
        let backup = destination.deletingLastPathComponent().appendingPathComponent("sarashina-editor-backup-\(stamp)")
        try fm.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
        try fm.copyItem(at: payload, to: staging)
        defer { try? fm.removeItem(at: staging) }
        // Codex does not expand CLAUDE_PLUGIN_ROOT in MCP args. Resolve at install time.
        let mcpConfig: [String: Any] = ["mcpServers": ["sarashina-editor": ["command": node, "args": [destination.appendingPathComponent("server.cjs").path]]]]
        try write(mcpConfig, to: staging.appendingPathComponent(".mcp.json"))
        // Repair already installed copies too; otherwise an existing cache can keep the bad path.
        let cache = home.appendingPathComponent(".codex/plugins/cache/\(marketName)/sarashina-editor")
        var cachedConfigs: [(URL, Data)] = []
        if fm.fileExists(atPath: cache.path) {
            for version in try fm.contentsOfDirectory(at: cache, includingPropertiesForKeys: nil) {
                let manifest = try object(version.appendingPathComponent(".codex-plugin/plugin.json"))
                let path = version.appendingPathComponent(".mcp.json")
                if manifest["name"] as? String == "sarashina-editor", fm.fileExists(atPath: path.path) {
                    cachedConfigs.append((path, try Data(contentsOf: path)))
                }
            }
        }
        let oldCatalog = fm.fileExists(atPath: catalog.path) ? try Data(contentsOf: catalog) : nil
        let oldKey = fm.fileExists(atPath: keyFile.path) ? try Data(contentsOf: keyFile) : nil
        if let data = oldCatalog {
            let url = catalog.appendingPathExtension("sarashina-backup-\(stamp)")
            try data.write(to: url, options: .atomic)
            try fm.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
        }
        if let data = oldConfig { try writeText(data, to: codexConfig.appendingPathExtension("sarashina-backup-\(stamp)")) }
        for (path, data) in cachedConfigs { try writeText(data, to: path.appendingPathExtension("sarashina-backup-\(stamp)")) }
        let hadOld = fm.fileExists(atPath: destination.path)
        if hadOld { try fm.moveItem(at: destination, to: backup) }
        do {
            try fm.moveItem(at: staging, to: destination)
            if !key.isEmpty { settings["api_key"] = key; try write(settings, to: keyFile) }
            try write(market, to: catalog)
            try writeText(Data(newConfig.utf8), to: codexConfig)
            for (path, _) in cachedConfigs { try write(mcpConfig, to: path) }
        } catch {
            for (path, data) in cachedConfigs { try? writeText(data, to: path) }
            try? fm.removeItem(at: destination)
            if hadOld { try? fm.moveItem(at: backup, to: destination) }
            if let data = oldCatalog { try? data.write(to: catalog, options: .atomic) }
            else { try? fm.removeItem(at: catalog) }
            if let data = oldKey { try? data.write(to: keyFile, options: .atomic); try? fm.setAttributes([.posixPermissions: 0o600], ofItemAtPath: keyFile.path) }
            else { try? fm.removeItem(at: keyFile) }
            if let data = oldConfig { try? writeText(data, to: codexConfig) }
            else { try? fm.removeItem(at: codexConfig) }
            throw error
        }
        let label = (market["interface"] as? [String: Any])?["displayName"] as? String ?? market["name"] as? String ?? "Personal"
        return label
    }
}

func nodeOK(_ path: String) -> Bool {
    guard FileManager.default.isExecutableFile(atPath: path) else { return false }
    let task = Process(); task.executableURL = URL(fileURLWithPath: path)
    task.arguments = ["-e", "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>20||(a===20&&b>=9)?0:1)"]
    task.standardOutput = FileHandle.nullDevice; task.standardError = FileHandle.nullDevice
    do { try task.run(); task.waitUntilExit(); return task.terminationStatus == 0 } catch { return false }
}

func detectNode() -> String {
    let home = FileManager.default.homeDirectoryForCurrentUser
    var choices = ["/opt/homebrew/bin/node", "/usr/local/bin/node", home.appendingPathComponent(".volta/bin/node").path]
    let versions = home.appendingPathComponent(".nvm/versions/node")
    if let dirs = try? FileManager.default.contentsOfDirectory(at: versions, includingPropertiesForKeys: nil) {
        choices += dirs.sorted { $0.lastPathComponent.compare($1.lastPathComponent, options: .numeric) == .orderedDescending }.map { $0.appendingPathComponent("bin/node").path }
    }
    return choices.first(where: nodeOK) ?? ""
}

final class SetupApp: NSObject, NSApplicationDelegate {
    var window: NSWindow!
    let key = NSSecureTextField()
    let node = NSTextField()
    let status = NSTextField(wrappingLabelWithString: "")
    func applicationDidFinishLaunching(_ notification: Notification) {
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 650, height: 450), styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
        window.title = "Sarashina Editor — Codex / ChatGPT セットアップ"
        let stack = NSStackView(); stack.orientation = .vertical; stack.alignment = .leading; stack.spacing = 14
        stack.translatesAutoresizingMaskIntoConstraints = false
        window.contentView!.addSubview(stack)
        NSLayoutConstraint.activate([stack.leadingAnchor.constraint(equalTo: window.contentView!.leadingAnchor, constant: 26), stack.trailingAnchor.constraint(equalTo: window.contentView!.trailingAnchor, constant: -26), stack.topAnchor.constraint(equalTo: window.contentView!.topAnchor, constant: 26)])
        func label(_ text: String) { stack.addArrangedSubview(NSTextField(wrappingLabelWithString: text)) }
        let title = NSTextField(labelWithString: "Codex / ChatGPTアプリに登録"); title.font = .boldSystemFont(ofSize: 22); stack.addArrangedSubview(title)
        label("個人用カタログへの登録とCodex設定での有効化を行います。保存後にアプリを再起動してください。CLIは不要です。")
        label("Sarashina APIキー（未発行なら空欄で登録できます）")
        key.placeholderString = "キーをここに入力"; key.translatesAutoresizingMaskIntoConstraints = false
        stack.addArrangedSubview(key); key.widthAnchor.constraint(equalTo: stack.widthAnchor).isActive = true
        label("キーはこのMacの専用設定ファイルに保存します（所有者のみ読み書き可能、暗号化なし）。チャットには送信しません。")
        let link = NSButton(title: "公式サイトでAPIキーを発行", target: self, action: #selector(openKeys)); stack.addArrangedSubview(link)
        label("Node.js 20.9以降（検出済みなら変更不要）")
        node.stringValue = detectNode(); node.placeholderString = "Node.jsの実行ファイルを選択"; node.translatesAutoresizingMaskIntoConstraints = false
        stack.addArrangedSubview(node); node.widthAnchor.constraint(equalTo: stack.widthAnchor).isActive = true
        let buttons = NSStackView(); buttons.orientation = .horizontal
        buttons.addArrangedSubview(NSButton(title: "Node.jsを選ぶ…", target: self, action: #selector(chooseNode)))
        buttons.addArrangedSubview(NSButton(title: "Node.js公式サイト", target: self, action: #selector(openNode)))
        let install = NSButton(title: "登録して保存", target: self, action: #selector(register)); install.bezelStyle = .rounded; buttons.addArrangedSubview(install)
        stack.addArrangedSubview(buttons); stack.addArrangedSubview(status)
        window.center(); window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true)
    }
    @objc func openKeys() { NSWorkspace.shared.open(URL(string: "https://chat.sarashina.ai/dashboard/api-keys")!) }
    @objc func openNode() { NSWorkspace.shared.open(URL(string: "https://nodejs.org/en/download")!) }
    @objc func chooseNode() {
        let panel = NSOpenPanel(); panel.canChooseFiles = true; panel.canChooseDirectories = false
        if panel.runModal() == .OK, let url = panel.url { node.stringValue = url.path }
    }
    @objc func register() {
        guard nodeOK(node.stringValue) else { status.stringValue = "Node.js 20.9以降を指定してください。未導入の場合は公式サイトのmacOSインストーラーから導入できます。"; return }
        guard let payload = Bundle.main.resourceURL?.appendingPathComponent("plugin") else { return }
        do {
            let name = try Installer(home: FileManager.default.homeDirectoryForCurrentUser, payload: payload).install(node: node.stringValue, apiKey: key.stringValue)
            key.stringValue = ""
            let alert = NSAlert(); alert.messageText = "登録しました"
            alert.informativeText = "カタログ登録と有効化設定を保存しました。\nCodex / ChatGPTアプリを完全終了して開き直し、新しいローカルチャットで「Sarashinaで推敲して」と依頼してください。\nPluginsのInstalledにも表示されるか確認してください。カタログ名: \(name)\n\nキーが未設定の場合は、このセットアップを再度開いて入力できます。"
            alert.runModal(); status.stringValue = "登録・有効化設定を保存しました。再起動後の反映と接続はアプリで確認してください。"
        } catch { status.stringValue = "登録できませんでした: \(error.localizedDescription)" }
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}

func selfTest() throws {
    let fm = FileManager.default
    let root = fm.temporaryDirectory.appendingPathComponent("sarashina-setup-test-\(UUID().uuidString)")
    defer { try? fm.removeItem(at: root) }
    let payload = root.appendingPathComponent("payload")
    try fm.createDirectory(at: payload, withIntermediateDirectories: true)
    try Data("test".utf8).write(to: payload.appendingPathComponent("server.cjs"))
    let installer = Installer(home: root.appendingPathComponent("home"), payload: payload)
    let cat = installer.home.appendingPathComponent(".agents/plugins/marketplace.json")
    let config = installer.home.appendingPathComponent(".codex/config.toml")
    let cached = installer.home.appendingPathComponent(".codex/plugins/cache/keep-existing/sarashina-editor/0.1.0")
    try installer.write(["name": "sarashina-editor"], to: cached.appendingPathComponent(".codex-plugin/plugin.json"))
    try installer.write(["mcpServers": ["sarashina-editor": ["command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/server.cjs"]]]], to: cached.appendingPathComponent(".mcp.json"))
    try installer.writeText(Data("model = \"keep-this\"\n[plugins.\"other@original\"]\nenabled = false\n".utf8), to: config)
    try installer.write(["name": "keep-existing", "plugins": [["name": "other", "source": ["source": "local", "path": "./other"]]], "custom": true], to: cat)
    _ = try installer.install(node: "/bin/echo", apiKey: "TEST_ONLY")
    _ = try installer.install(node: "/bin/echo", apiKey: "")
    let saved = try installer.object(cat)
    for root in [installer.home.appendingPathComponent(".codex/plugins/sarashina-editor"), cached] {
        let mcp = try installer.object(root.appendingPathComponent(".mcp.json"))
        let servers = mcp["mcpServers"] as! [String: [String: Any]]
        let args = servers["sarashina-editor"]!["args"] as! [String]
        precondition(args.count == 1 && args[0].hasPrefix("/") && !args[0].contains("${"))
        precondition(fm.fileExists(atPath: args[0]))
    }
    precondition(saved["name"] as? String == "keep-existing")
    precondition((saved["plugins"] as? [[String: Any]])?.count == 2)
    let configText = try String(contentsOf: config, encoding: .utf8)
    precondition(configText.contains("model = \"keep-this\""))
    precondition(configText.contains("[plugins.\"other@original\"]\nenabled = false"))
    precondition(configText.components(separatedBy: "[plugins.\"sarashina-editor@keep-existing\"]").count == 2)
    precondition(configText.contains("[plugins.\"sarashina-editor@keep-existing\"]\nenabled = true"))
    let singleQuoted = try installer.enablePlugin(in: "[plugins.'sarashina-editor@keep-existing']\nenabled = false\n[another]\nx=1", id: "sarashina-editor@keep-existing")
    precondition(singleQuoted.contains("enabled = true\n[another]"))
    let keyURL = installer.home.appendingPathComponent(".config/sarashina-editor/config.json")
    let keyObject = try installer.object(keyURL)
    precondition(keyObject["api_key"] as? String == "TEST_ONLY")
    let attrs = try fm.attributesOfItem(atPath: keyURL.path)
    precondition((attrs[.posixPermissions] as? NSNumber)?.intValue == 0o600)
    try Data("broken".utf8).write(to: cat)
    var rejected = false
    do { _ = try installer.install(node: "/bin/echo", apiKey: "changed") } catch { rejected = true }
    precondition(rejected)
    let raw = try String(contentsOf: cat, encoding: .utf8)
    precondition(raw == "broken")
    print("PASS: installed and cached MCP use existing absolute paths; catalog and unrelated TOML preserved, plugin enabled, idempotent registration, key retained, 0600 permissions, corrupt config rejected")
}

if CommandLine.arguments.contains("--self-test") {
    do { try selfTest() } catch { fputs("Self-test failed: \(error)\n", stderr); exit(1) }
} else {
    let app = NSApplication.shared; app.setActivationPolicy(.regular)
    let delegate = SetupApp(); app.delegate = delegate; app.run()
}
