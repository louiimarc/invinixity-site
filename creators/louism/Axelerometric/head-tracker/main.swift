import AppKit
import CoreMotion
import simd

final class Tracker: NSObject, NSApplicationDelegate {
    let motion = CMHeadphoneMotionManager()
    let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 450, height: 170),
                          styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
    let status = NSTextField(wrappingLabelWithString: "Connect your AirPods, then start tracking.")
    let start = NSButton(title: "Start tracking", target: nil, action: nil)
    let center = NSButton(title: "Recenter", target: nil, action: nil)
    var socket: URLSessionWebSocketTask?
    var reference: simd_quatd?
    var basis: (right: SIMD3<Double>, up: SIMD3<Double>, front: SIMD3<Double>)?
    var running = false
    var sending = false
    var retryAfter = Date.distantPast
    var lastMotion = -Double.infinity
    var timer: Timer?

    func applicationDidFinishLaunching(_ notification: Notification) {
        window.title = "Axelerometric Head Tracker"
        let buttons = NSStackView(views: [start, center])
        let stack = NSStackView(views: [status, buttons])
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 16
        stack.frame = window.contentView!.bounds.insetBy(dx: 20, dy: 20)
        window.contentView!.addSubview(stack)
        start.target = self
        start.action = #selector(toggle)
        center.target = self
        center.action = #selector(recenter)
        center.isEnabled = false
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    @objc func recenter() { reference = nil }

    @objc func toggle() {
        running.toggle()
        start.title = running ? "Stop tracking" : "Start tracking"
        reference = nil
        if running {
            // Poll the latest measurement at audio-control rate without queueing old poses.
            motion.startDeviceMotionUpdates()
            timer = Timer.scheduledTimer(withTimeInterval: 1.0/30, repeats: true) { [weak self] _ in self?.tick() }
        } else {
            timer?.invalidate()
            motion.stopDeviceMotionUpdates()
            disconnect()
            center.isEnabled = false
            status.stringValue = "Tracking stopped."
        }
    }

    func disconnect() {
        socket?.cancel(with: .goingAway, reason: nil)
        socket = nil
        sending = false
    }

    func tick() {
        let auth = CMHeadphoneMotionManager.authorizationStatus()
        guard auth != .denied && auth != .restricted else {
            status.stringValue = "Motion access is disabled. Check System Settings → Privacy & Security → Motion & Fitness."
            center.isEnabled = false
            return
        }
        guard let sample = motion.deviceMotion,
              ProcessInfo.processInfo.systemUptime - sample.timestamp < 1 else {
            center.isEnabled = false
            reference = nil
            status.stringValue = "Waiting for AirPods motion. Wear the AirPods and allow Motion & Fitness access."
            return
        }
        guard sample.timestamp != lastMotion, !sending, Date() >= retryAfter else { return }
        lastMotion = sample.timestamp
        let q = sample.attitude.quaternion
        let pose = simd_quatd(ix: q.x, iy: q.y, iz: q.z, r: q.w)
        if reference == nil {
            let g = sample.gravity
            let up = simd_normalize(SIMD3(-g.x, -g.y, -g.z))
            let front = simd_normalize(simd_cross(up, SIMD3(1.0, 0, 0)))
            guard front.x.isFinite else { return }
            basis = (simd_cross(front, up), up, front)
            reference = pose
        }
        guard let reference, let basis else { return }
        let rotation = reference.inverse * pose
        func audioAxes(_ direction: SIMD3<Double>) -> [Double] {
            let v = rotation.act(direction)
            return [simd_dot(v,basis.right), simd_dot(v,basis.up), -simd_dot(v,basis.front)]
        }
        let axes = audioAxes(basis.front) + audioAxes(basis.up)
        guard let data = try? JSONEncoder().encode(axes) else { return }
        if socket == nil {
            socket = URLSession.shared.webSocketTask(with: URL(string: "ws://127.0.0.1:8765/sync/head-input")!)
            socket?.resume()
        }
        guard let current = socket else { return }
        sending = true
        current.send(.data(data)) { error in
            DispatchQueue.main.async {
                guard self.socket === current else { return }
                self.sending = false
                if error != nil {
                    self.disconnect()
                    self.retryAfter = Date().addingTimeInterval(1)
                    self.status.stringValue = "Waiting for the Axelerometric server on this Mac (port 8765)."
                } else {
                    self.center.isEnabled = true
                    self.status.stringValue = "Sending head rotation. Face the screen and click Recenter to set front."
                }
            }
        }
    }
}

let app = NSApplication.shared
let tracker = Tracker()
app.setActivationPolicy(.regular)
app.delegate = tracker
app.run()
