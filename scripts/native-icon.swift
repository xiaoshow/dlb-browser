import AppKit
let args = CommandLine.arguments
if args.count != 3 { exit(2) }
let image = NSImage(size: NSSize(width: 512, height: 512))
image.lockFocus()
NSColor(calibratedRed: 0.22, green: 0.35, blue: 0.92, alpha: 1).setFill()
NSBezierPath(roundedRect: NSRect(x: 12, y: 12, width: 488, height: 488), xRadius: 104, yRadius: 104).fill()
let paragraph = NSMutableParagraphStyle(); paragraph.alignment = .center
("P" as NSString).draw(in: NSRect(x: 0, y: 148, width: 512, height: 330), withAttributes: [.font: NSFont.boldSystemFont(ofSize: 280), .foregroundColor: NSColor.white, .paragraphStyle: paragraph])
NSColor(calibratedRed: 0.92, green: 0.23, blue: 0.25, alpha: 1).setFill()
NSBezierPath(roundedRect: NSRect(x: 32, y: 24, width: 448, height: 150), xRadius: 34, yRadius: 34).fill()
(args[1] as NSString).draw(in: NSRect(x: 32, y: 28, width: 448, height: 140), withAttributes: [.font: NSFont.boldSystemFont(ofSize: args[1].count > 4 ? 80 : 110), .foregroundColor: NSColor.white, .paragraphStyle: paragraph])
image.unlockFocus()
let rep = NSBitmapImageRep(data: image.tiffRepresentation!)!
try rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: args[2]))
