// --- added by mobile/ios/capacitor.mjs (patch): files other apps hand to this one ---

import Foundation
import UIKit

/// Files handed to the app (Open in…, the share sheet, Files, Mail), at launch or later: SceneDelegate gives them here
/// (mobile/ios/doctypes.mjs hookScene). Each gets a token and a copy in the cache root the page reads (the original
/// may need its security scope, or be an iCloud file still on its way). A file opened in place keeps its place as a
/// bookmark, so a save can go back to it (writeBack). A copy the system made for the app (its Inbox) is removed once
/// read. A file that is already in the app's own folder says so (inside, rel): the page opens it as that file.
final class SiteInbox {
    static let shared = SiteInbox()
    static let arrived = Notification.Name("SiteInboxArrived")
    private static let marksKey = "SiteFilesBookmarks", keep = 64
    private let lock = NSLock()
    private var waiting: [[String: Any]] = []

    func receive(_ contexts: Set<UIOpenURLContext>) {
        let list = contexts.filter { $0.url.isFileURL }.map { ($0.url, $0.options.openInPlace) }
        if list.isEmpty { return }
        DispatchQueue.global(qos: .userInitiated).async {
            let got = list.compactMap { self.accept($0.0, inPlace: $0.1) }
            self.lock.lock(); self.waiting.append(contentsOf: got); self.lock.unlock()
            if !got.isEmpty { NotificationCenter.default.post(name: SiteInbox.arrived, object: nil) }
        }
    }

    /// The files waiting for the page, once.
    func take() -> [[String: Any]] {
        lock.lock(); defer { lock.unlock() }
        let out = waiting
        waiting = []
        return out
    }

    private func accept(_ url: URL, inPlace: Bool) -> [String: Any]? {
        let token = UUID().uuidString.lowercased(), name = url.lastPathComponent, fm = FileManager.default
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        let dir = SiteRoots.cache.appendingPathComponent("opened", isDirectory: true).appendingPathComponent(token, isDirectory: true)
        do {
            try fm.createDirectory(at: dir, withIntermediateDirectories: true)
            try siteCoordinated(url, writing: false) { u in try fm.copyItem(at: u, to: dir.appendingPathComponent(name)) }
        } catch {
            NSLog("SiteInbox: could not read \(name): \(error.localizedDescription)")
            return nil
        }
        var entry: [String: Any] = ["token": token, "name": name, "path": "opened/\(token)/\(name)", "inPlace": false, "inside": "", "rel": ""]
        if let hit = inside(url) {
            entry["inside"] = hit.root
            entry["rel"] = hit.rel
        } else if inPlace, let mark = try? url.bookmarkData() {
            remember(token, mark)
            entry["inPlace"] = true
        } else if !inPlace, url.path.contains("Inbox/") {
            try? fm.removeItem(at: url)   // the system's copy for this app: the cache copy is the one the page reads
            let box = url.deletingLastPathComponent()
            if box.lastPathComponent == "Inbox", (try? fm.contentsOfDirectory(atPath: box.path))?.isEmpty == true { try? fm.removeItem(at: box) }
        }
        return entry
    }

    /// ("documents" | "icloud", path inside it) for a file in the app's own folder, else nil.
    private func inside(_ url: URL) -> (root: String, rel: String)? {
        let p = url.resolvingSymlinksInPath().standardizedFileURL.path
        let bases: [(String, URL?)] = [("documents", SiteRoots.documents), ("icloud", SiteRoots.icloud())]
        for (root, base) in bases {
            guard let b = base?.resolvingSymlinksInPath().standardizedFileURL.path else { continue }
            if p.hasPrefix(b + "/") && !p.hasPrefix(b + "/Inbox/") { return (root: root, rel: String(p.dropFirst(b.count + 1))) }
        }
        return nil
    }

    private func remember(_ token: String, _ mark: Data) {
        let d = UserDefaults.standard
        var marks = d.dictionary(forKey: SiteInbox.marksKey) as? [String: Data] ?? [:]
        var order = d.stringArray(forKey: SiteInbox.marksKey + "Order") ?? []
        marks[token] = mark
        order.removeAll { $0 == token }
        order.append(token)
        while order.count > SiteInbox.keep { marks.removeValue(forKey: order.removeFirst()) }
        d.set(marks, forKey: SiteInbox.marksKey)
        d.set(order, forKey: SiteInbox.marksKey + "Order")
    }

    /// Writes the file at from over the file token was opened from. Resolves that file's name.
    func writeBack(_ token: String, from: URL) throws -> String {
        guard let mark = (UserDefaults.standard.dictionary(forKey: SiteInbox.marksKey) as? [String: Data])?[token] else {
            throw SiteError("This file was not opened in place.")
        }
        var stale = false
        let url = try URL(resolvingBookmarkData: mark, bookmarkDataIsStale: &stale)
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        let bytes = try Data(contentsOf: from)
        try siteCoordinated(url, writing: true) { u in try bytes.write(to: u) }
        if stale, let fresh = try? url.bookmarkData() { remember(token, fresh) }
        try? FileManager.default.removeItem(at: from)
        return url.lastPathComponent
    }
}
