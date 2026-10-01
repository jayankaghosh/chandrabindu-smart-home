import Foundation

enum HubError: LocalizedError {
    case unreachable
    case unauthorized
    case server(Int, String)
    case badResponse

    var errorDescription: String? {
        switch self {
        case .unreachable: return "Can't reach your home hub."
        case .unauthorized: return "Your session has expired. Please sign in again."
        case .server(_, let message): return message
        case .badResponse: return "Unexpected response from the hub."
        }
    }
}

enum Reachability { case ok, unreachable, notHub }

/// Talks to the hub's REST API with the Bearer token native clients get from
/// /api/auth/login. Cookies stay on (shared storage) because a room unlock is
/// recorded in the `shc_unlocks` cookie, which later commands must carry.
final class HubClient: @unchecked Sendable {
    private(set) var base: String
    var token: String?
    private let session: URLSession
    private let streamSession: URLSession

    static let expectedName = "Chandrabindu Smart Home"

    init(base: String) {
        self.base = HubClient.normalize(base)

        let c = URLSessionConfiguration.default
        c.timeoutIntervalForRequest = 15
        c.waitsForConnectivity = false
        c.httpCookieStorage = .shared
        c.requestCachePolicy = .reloadIgnoringLocalCacheData
        session = URLSession(configuration: c)

        // The event stream idles between messages; the gateway pings every 20s.
        let s = URLSessionConfiguration.default
        s.timeoutIntervalForRequest = 90
        s.timeoutIntervalForResource = 60 * 60 * 24 * 7
        s.httpCookieStorage = .shared
        s.requestCachePolicy = .reloadIgnoringLocalCacheData
        streamSession = URLSession(configuration: s)
    }

    static func normalize(_ raw: String) -> String {
        var s = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if !s.lowercased().hasPrefix("http://") && !s.lowercased().hasPrefix("https://") { s = "http://" + s }
        while s.hasSuffix("/") { s.removeLast() }
        return s
    }

    func setBase(_ raw: String) { base = HubClient.normalize(raw) }

    var host: String { URL(string: base)?.host ?? base }

    private func request(_ path: String, method: String, body: [String: Any]?, timeout: TimeInterval) throws -> URLRequest {
        guard let url = URL(string: base + path) else { throw HubError.badResponse }
        var r = URLRequest(url: url, timeoutInterval: timeout)
        r.httpMethod = method
        r.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token { r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let body {
            r.httpBody = try JSONSerialization.data(withJSONObject: body)
            r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        return r
    }

    private static func mapTransport(_ error: Error) -> Error {
        if error is CancellationError { return error }
        if let u = error as? URLError, u.code == .cancelled { return CancellationError() }
        return HubError.unreachable
    }

    @discardableResult
    func send(_ path: String, method: String = "POST", body: [String: Any]? = nil, timeout: TimeInterval = 25) async throws -> Data {
        let req = try request(path, method: method, body: body, timeout: timeout)
        let data: Data
        let response: URLResponse
        do { (data, response) = try await session.data(for: req) } catch { throw HubClient.mapTransport(error) }
        guard let http = response as? HTTPURLResponse else { throw HubError.badResponse }
        if http.statusCode == 401 { throw HubError.unauthorized }
        guard (200..<300).contains(http.statusCode) else {
            let message = (try? JSONDecoder().decode(ErrorBody.self, from: data))?.error
            throw HubError.server(http.statusCode, message ?? "Request failed (\(http.statusCode))")
        }
        return data
    }

    func get<T: Decodable>(_ path: String, timeout: TimeInterval = 15) async throws -> T {
        try decode(try await send(path, method: "GET", timeout: timeout))
    }

    func call<T: Decodable>(_ path: String, method: String = "POST", body: [String: Any]? = nil, timeout: TimeInterval = 25) async throws -> T {
        try decode(try await send(path, method: method, body: body, timeout: timeout))
    }

    private func decode<T: Decodable>(_ data: Data) throws -> T {
        do { return try JSONDecoder().decode(T.self, from: data) } catch { throw HubError.badResponse }
    }

    /// Is the hub there, and is it really our hub (not some other box at that IP)?
    func ping() async -> Reachability {
        guard let url = URL(string: base + "/api/metadata") else { return .unreachable }
        do {
            let (data, response) = try await session.data(for: URLRequest(url: url, timeoutInterval: 3))
            guard let http = response as? HTTPURLResponse, http.statusCode == 200,
                  let meta = try? JSONDecoder().decode(Metadata.self, from: data) else { return .notHub }
            return meta.name == HubClient.expectedName ? .ok : .notHub
        } catch {
            return .unreachable
        }
    }

    /// Streams /api/events until it ends or fails. Returns false (immediately)
    /// when the hub has no live stream (no device gateway, HTTP 204).
    func streamEvents(_ onEvent: @escaping @Sendable (String, Data) async -> Void) async throws -> Bool {
        var req = try request("/api/events", method: "GET", body: nil, timeout: 90)
        req.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        let bytes: URLSession.AsyncBytes
        let response: URLResponse
        do { (bytes, response) = try await streamSession.bytes(for: req) } catch { throw HubClient.mapTransport(error) }
        guard let http = response as? HTTPURLResponse else { throw HubError.badResponse }
        if http.statusCode == 204 { return false }
        if http.statusCode == 401 { throw HubError.unauthorized }
        guard http.statusCode == 200 else { throw HubError.server(http.statusCode, "Event stream failed") }

        // The gateway writes `event: <name>` then a single-line `data: <json>`,
        // so each data line is a complete message.
        var event = "message"
        do {
            for try await line in bytes.lines {
                if line.hasPrefix(":") { continue }
                if line.hasPrefix("event:") {
                    event = String(line.dropFirst(6)).trimmingCharacters(in: .whitespaces)
                } else if line.hasPrefix("data:") {
                    let payload = String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces)
                    await onEvent(event, Data(payload.utf8))
                    event = "message"
                }
            }
        } catch {
            throw HubClient.mapTransport(error)
        }
        throw HubError.unreachable // the stream ended; caller reconnects
    }
}
