// --- added by mobile/ios/capacitor.mjs (patch): the app's files ---

import Foundation
import UIKit
import Capacitor

/// The places the page names (the "root" of a call): "documents", the app's Documents folder (Files › On My iPhone/iPad
/// › the app, in device backups); "icloud", the app's folder in iCloud Drive (a build with an iCloud container, iCloud
/// on, the setting on); "cache", temporary copies (files opened from other apps, saves on their way back).
enum SiteRoots {
    static let containerKey = "SiteICloudContainer"   // Info.plist, written by capacitor.mjs icloud
    static let icloudSetting = "SiteFilesICloud"
    static var documents: URL { FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0] }
    static var cache: URL {
        let u = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("site-files", isDirectory: true)
        try? FileManager.default.createDirectory(at: u, withIntermediateDirectories: true)
        return u
    }
    static var container: String? {
        guard let id = Bundle.main.object(forInfoDictionaryKey: containerKey) as? String, !id.isEmpty else { return nil }
        return id
    }
    /// The iCloud Drive folder (the container's Documents), or nil without the entitlement or an iCloud account. Can block:
    /// call it off the main thread.
    static func icloud() -> URL? {
        guard let id = container, let c = FileManager.default.url(forUbiquityContainerIdentifier: id) else { return nil }
        let d = c.appendingPathComponent("Documents", isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }
    static func url(_ root: String?) -> URL? {
        switch root ?? "documents" {
        case "cache": return cache
        case "icloud": return icloud()
        case "documents": return documents
        default: return nil
        }
    }
    /// A path inside a root ("" is the root itself); nil for a root that is not there or a path that leaves it.
    static func resolve(_ root: String?, _ path: String?) -> URL? {
        guard let base = url(root) else { return nil }
        let parts = (path ?? "").split(separator: "/").map(String.init)
        if parts.contains(where: { $0 == ".." || $0 == "." }) { return nil }
        return parts.reduce(base) { $0.appendingPathComponent($1) }
    }
}

struct SiteError: LocalizedError {
    let errorDescription: String?
    init(_ text: String) { errorDescription = text }
}

/// Coordinated file work (another process, the iCloud daemon or a file provider, may be using the file).
func siteCoordinated(_ url: URL, writing: Bool, _ body: (URL) throws -> Void) throws {
    var err: NSError?, failure: Error?
    let c = NSFileCoordinator()
    if writing { c.coordinate(writingItemAt: url, options: .forReplacing, error: &err) { u in do { try body(u) } catch { failure = error } } }
    else { c.coordinate(readingItemAt: url, options: .withoutChanges, error: &err) { u in do { try body(u) } catch { failure = error } } }
    if let e = err ?? failure { throw e }
}

/// The page's file calls (window.SlopNativeFiles in native/files.js). Paths are relative to a root, "/" between names.
@objc(SiteFilesPlugin)
public class SiteFilesPlugin: CAPPlugin, CAPBridgedPlugin, UIDocumentPickerDelegate {
    public let identifier = "SiteFilesPlugin"
    public let jsName = "SiteFiles"
    public let pluginMethods: [CAPPluginMethod] = ["info", "setICloud", "tree", "write", "move", "remove", "mkdir", "takeOpened", "writeBack", "exportFile"]
        .map { CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise) }
    private let work = DispatchQueue(label: "site.files")
    private var exportCall: CAPPluginCall?

    override public func load() {
        NotificationCenter.default.addObserver(self, selector: #selector(arrived), name: SiteInbox.arrived, object: nil)
    }
    @objc private func arrived() { notifyListeners("opened", data: [:], retainUntilConsumed: true) }

    private func run(_ call: CAPPluginCall, _ body: @escaping () throws -> [String: Any]) {
        work.async {
            do { call.resolve(try body()) } catch { call.reject(error.localizedDescription) }
        }
    }
    private func place(_ call: CAPPluginCall, _ key: String = "path") throws -> URL {
        guard let u = SiteRoots.resolve(call.getString("root"), call.getString(key)) else { throw SiteError("That place is not available.") }
        return u
    }
    static func stat(_ u: URL) -> [String: Any] {
        let a = (try? FileManager.default.attributesOfItem(atPath: u.path)) ?? [:]
        let m = (a[.modificationDate] as? Date)?.timeIntervalSince1970 ?? 0
        return ["size": (a[.size] as? NSNumber)?.doubleValue ?? 0, "mtime": (m * 1000).rounded()]
    }

    /// { documents, cache, icloud (url or ""), container (id or ""), icloudOn }
    @objc func info(_ call: CAPPluginCall) {
        run(call) {
            let ic = SiteRoots.icloud()
            return ["documents": SiteRoots.documents.absoluteString, "cache": SiteRoots.cache.absoluteString, "icloud": ic?.absoluteString ?? "",
                    "container": SiteRoots.container ?? "", "icloudOn": ic != nil && UserDefaults.standard.bool(forKey: SiteRoots.icloudSetting)]
        }
    }
    @objc func setICloud(_ call: CAPPluginCall) {
        UserDefaults.standard.set(call.getBool("on", false), forKey: SiteRoots.icloudSetting)
        info(call)
    }

    /// Every file and folder under the root: { entries: [{ path, dir, size, mtime, placeholder }] }. Hidden names and the
    /// system's Inbox are left out; an iCloud file not on this device yet (".name.icloud") is listed as a placeholder and
    /// its download started.
    @objc func tree(_ call: CAPPluginCall) {
        run(call) {
            let base = try self.place(call), fm = FileManager.default
            var out: [[String: Any]] = []
            let keys: [URLResourceKey] = [.isDirectoryKey, .fileSizeKey, .contentModificationDateKey]
            guard let en = fm.enumerator(at: base, includingPropertiesForKeys: keys, options: [.skipsPackageDescendants, .producesRelativePathURLs]) else { return ["entries": out] }
            for case let u as URL in en {
                let rel = u.relativePath, name = u.lastPathComponent
                let v = try? u.resourceValues(forKeys: Set(keys))
                let dir = v?.isDirectory ?? false
                if rel == "Inbox" || name.hasPrefix(".") {
                    if dir { en.skipDescendants() }
                    if name.hasPrefix("."), name.hasSuffix(".icloud"), !dir {
                        let real = String(name.dropFirst().dropLast(7)), parent = (rel as NSString).deletingLastPathComponent
                        try? fm.startDownloadingUbiquitousItem(at: base.appendingPathComponent(parent).appendingPathComponent(real))
                        out.append(["path": parent.isEmpty ? real : parent + "/" + real, "dir": false, "size": 0, "mtime": 0, "placeholder": true])
                    }
                    continue
                }
                let m = (v?.contentModificationDate?.timeIntervalSince1970 ?? 0) * 1000
                out.append(["path": rel, "dir": dir, "size": Double(v?.fileSize ?? 0), "mtime": m.rounded(), "placeholder": false])
            }
            return ["entries": out]
        }
    }

    /// Writes base64 data to path (append: adds to the end), making its folders. Resolves the file's { size, mtime }.
    @objc func write(_ call: CAPPluginCall) {
        run(call) {
            let u = try self.place(call)
            guard let b64 = call.getString("data"), let data = Data(base64Encoded: b64) else { throw SiteError("No data to write.") }
            try FileManager.default.createDirectory(at: u.deletingLastPathComponent(), withIntermediateDirectories: true)
            try siteCoordinated(u, writing: true) { w in
                if call.getBool("append", false), let h = try? FileHandle(forWritingTo: w) {
                    defer { try? h.close() }
                    _ = try h.seekToEnd()
                    try h.write(contentsOf: data)
                } else { try data.write(to: w) }
            }
            return SiteFilesPlugin.stat(u)
        }
    }
    /// Moves the file at from to to (paths in the root), replacing what is there.
    @objc func move(_ call: CAPPluginCall) {
        run(call) {
            let from = try self.place(call, "from"), to = try self.place(call, "to"), fm = FileManager.default
            guard !(call.getString("from") ?? "").isEmpty, !(call.getString("to") ?? "").isEmpty else { throw SiteError("Move what where?") }
            try fm.createDirectory(at: to.deletingLastPathComponent(), withIntermediateDirectories: true)
            try siteCoordinated(to, writing: true) { w in
                if fm.fileExists(atPath: w.path) { try fm.removeItem(at: w) }
                try fm.moveItem(at: from, to: w)
            }
            return SiteFilesPlugin.stat(to)
        }
    }
    /// Removes a file or folder (emptyOnly: a folder only when nothing is in it). Nothing there is not an error.
    @objc func remove(_ call: CAPPluginCall) {
        run(call) {
            let u = try self.place(call), fm = FileManager.default
            guard fm.fileExists(atPath: u.path), !(call.getString("path") ?? "").isEmpty else { return ["removed": false] }
            if call.getBool("emptyOnly", false), let kids = try? fm.contentsOfDirectory(atPath: u.path), kids.contains(where: { !$0.hasPrefix(".") }) { return ["removed": false] }
            try siteCoordinated(u, writing: true) { w in try fm.removeItem(at: w) }
            return ["removed": true]
        }
    }
    @objc func mkdir(_ call: CAPPluginCall) {
        run(call) {
            try FileManager.default.createDirectory(at: try self.place(call), withIntermediateDirectories: true)
            return [:]
        }
    }

    /// The files other apps handed over since the last call (SiteInbox): { files: [{ token, name, path, inPlace, inside, rel }] }.
    @objc func takeOpened(_ call: CAPPluginCall) {
        call.resolve(["files": SiteInbox.shared.take()])
    }
    /// Saves the cache file at path over the file token was opened from (in place, where it is: Files, iCloud Drive, another provider).
    @objc func writeBack(_ call: CAPPluginCall) {
        run(call) {
            guard let token = call.getString("token") else { throw SiteError("Which file?") }
            let name = try SiteInbox.shared.writeBack(token, from: try self.place(call))
            return ["name": name]
        }
    }
    /// The system's Save to Files sheet for a file (a copy goes where the person chooses): { saved, name }.
    @objc func exportFile(_ call: CAPPluginCall) {
        guard let u = SiteRoots.resolve(call.getString("root"), call.getString("path")), FileManager.default.fileExists(atPath: u.path) else {
            call.reject("That file is not there.")
            return
        }
        DispatchQueue.main.async {
            let picker = UIDocumentPickerViewController(forExporting: [u], asCopy: true)
            picker.delegate = self
            self.exportCall?.resolve(["saved": false])
            self.exportCall = call
            self.bridge?.viewController?.present(picker, animated: true)
        }
    }
    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        exportCall?.resolve(["saved": true, "name": urls.first?.lastPathComponent ?? ""])
        exportCall = nil
    }
    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        exportCall?.resolve(["saved": false])
        exportCall = nil
    }
}
