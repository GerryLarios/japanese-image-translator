import Foundation
import Vision
import AppKit

let arguments = CommandLine.arguments

guard arguments.count > 1 else {
    fputs("usage: apple-vision-ocr.swift <image-path>\n", stderr)
    exit(1)
}

let imagePath = arguments[1]
let imageURL = URL(fileURLWithPath: imagePath)

guard let image = NSImage(contentsOf: imageURL) else {
    fputs("could not open image\n", stderr)
    exit(1)
}

guard let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    fputs("could not create cgImage\n", stderr)
    exit(1)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true
request.recognitionLanguages = ["ja-JP", "en-US"]

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
try handler.perform([request])

let observations = request.results ?? []
let strings = observations.compactMap { $0.topCandidates(1).first?.string }
print(strings.joined(separator: "\n"))
