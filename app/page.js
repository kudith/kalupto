"use client";
import Image from "next/image";
import { useState } from "react";
import {
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  LockClosedIcon,
  LockOpenIcon,
} from "@heroicons/react/24/outline";
import { upload } from "@vercel/blob/client";

export default function Home() {
  const [mode, setMode] = useState("encode"); // encode or decode
  const [image, setImage] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setImage(file);
    const reader = new FileReader();
    reader.onload = () => {
      setPreviewUrl(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleModeChange = (newMode) => {
    setMode(newMode);
    setResult(null);
    setError(null);
  };

  // Add this function to compress images before upload
  const compressImage = async (imageFile, maxSizeMB = 4) => {
    try {
      // Check if image file is valid
      if (!imageFile) {
        console.error("No image file provided for compression");
        return null;
      }

      // Only compress if file is larger than 1MB
      if (imageFile.size < 1024 * 1024) {
        console.log("Image small enough, skipping compression");
        return imageFile;
      }

      // Import the module safely
      let imageCompression;
      try {
        const imageCompressionModule = await import(
          "browser-image-compression"
        );
        imageCompression = imageCompressionModule.default;

        if (!imageCompression) {
          throw new Error("Image compression module is undefined");
        }
      } catch (importErr) {
        console.error("Failed to import compression module:", importErr);
        return imageFile; // Return original if import fails
      }

      const options = {
        maxSizeMB: maxSizeMB,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
      };

      console.log("Starting compression process...");
      const compressedFile = await imageCompression(imageFile, options);
      console.log(`Original size: ${imageFile.size / 1024 / 1024} MB`);
      console.log(`Compressed size: ${compressedFile.size / 1024 / 1024} MB`);
      return compressedFile;
    } catch (error) {
      // More detailed error logging
      console.error("Error compressing image:", error);
      console.error("Error name:", error.name || "Unknown");
      console.error("Error message:", error.message || "No message");
      // Return original file as fallback
      return imageFile;
    }
  };

  // ...existing code...

  // ...existing code...

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // Check if image exists
      if (!image) {
        throw new Error("No image selected");
      }

      // Check API URL configuration
      if (!process.env.NEXT_PUBLIC_API_URL) {
        throw new Error(
          "API URL is not configured. Check your .env file and restart the server."
        );
      }

      // Process image based on mode
      let processedImage;
      if (mode === "encode") {
        // Only compress image for encoding
        console.log("Compressing image for encoding...");
        processedImage = await compressImage(image);

        if (!processedImage) {
          throw new Error("Image compression failed");
        }
      } else {
        // For decode, use original image without compression
        console.log("Using original image for decoding...");
        processedImage = image;
      }

      // Upload image to Vercel Blob storage directly
      console.log("Uploading to Vercel Blob...");
      const blob = await upload(`kalupto-${Date.now()}.png`, processedImage, {
        access: "public",
        handleUploadUrl: "/api/blob-upload",
      });

      console.log("Image uploaded to Blob:", blob.url);

      // Create payload with image URL instead of the file
      const payload = {
        imageUrl: blob.url,
      };

      if (mode === "encode") {
        payload.message = message;
      }

      // Use the URL-based endpoints instead of file upload endpoints
      const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}${mode}-url`;
      console.log(`Submitting to URL endpoint: ${apiUrl}`);

      // Create controller for request timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      try {
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
          cache: "no-store",
        });

        clearTimeout(timeoutId);

        // Log the response status
        console.log(`Response status: ${response.status}`);

        // Debug: Check response headers
        console.log(
          "Response headers:",
          Array.from(response.headers.entries()).reduce(
            (obj, [key, val]) => ({ ...obj, [key]: val }),
            {}
          )
        );

        // Try to parse the response
        let data;
        try {
          const text = await response.text();
          console.log(`Response length: ${text.length} chars`);
          console.log(`Response preview: ${text.substring(0, 100)}...`);

          data = JSON.parse(text);
        } catch (parseError) {
          console.error("Failed to parse response:", parseError);
          throw new Error(`Failed to parse response: ${parseError.message}`);
        }

        if (!response.ok) {
          throw new Error(data.message || "An error occurred");
        }

        console.log("Parsed data:", data);
        if (mode === "encode" && !data.encoded_image) {
          throw new Error("No encoded image returned from server");
        }

        setResult(data);
      } catch (fetchError) {
        if (fetchError.name === "AbortError") {
          throw new Error(
            "Request timed out. The server took too long to respond."
          );
        }
        throw fetchError;
      }
    } catch (err) {
      console.error("Error in submission:", err);
      setError(
        err.message ||
          "Connection to server failed. Please ensure the backend is running."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!result?.encoded_image) return;

    const link = document.createElement("a");
    link.href = `data:image/png;base64,${result.encoded_image}`;
    link.download = "stegano-image.png";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="grid grid-rows-[auto_1fr_auto] items-center justify-items-center min-h-screen p-8 pb-20 gap-8 sm:p-20 font-[family-name:var(--font-geist-sans)] bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      {/* Header */}
      <header className="w-full max-w-3xl text-center">
        <h1 className="text-5xl font-extrabold text-slate-900 dark:text-slate-200 mb-4">
          Kalupto
        </h1>
        <p className="text-slate-600 dark:text-slate-300 mb-6">
          A powerful steganography tool that securely embeds your secret
          messages within images using advanced DCT algorithm
        </p>

        {/* Mode Selector */}
        <div className="inline-flex p-1 rounded-lg bg-slate-200 dark:bg-slate-700">
          <button
            onClick={() => handleModeChange("encode")}
            className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-all ${
              mode === "encode"
                ? "bg-white dark:bg-slate-600 text-slate-800 dark:text-white shadow-sm"
                : "text-slate-600 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-600/50"
            }`}
          >
            <LockClosedIcon className="w-4 h-4 mr-2" />
            Encode Message
          </button>
          <button
            onClick={() => handleModeChange("decode")}
            className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-all ${
              mode === "decode"
                ? "bg-white dark:bg-slate-600 text-slate-800 dark:text-white shadow-sm"
                : "text-slate-600 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-600/50"
            }`}
          >
            <LockOpenIcon className="w-4 h-4 mr-2" />
            Decode Message
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full max-w-3xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Image Upload */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Upload Image
            </label>

            {/* Info alert about file format and size */}
            <div className="mb-2 flex items-center gap-2 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 p-3 rounded-md border border-blue-200 dark:border-blue-800">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 flex-shrink-0"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2h-1V9a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              <div>
                {mode === "encode" ? (
                  <>
                    <span className="font-medium">Recommended Format:</span> Use{" "}
                    <strong>PNG</strong> for best results.
                    <ul className="mt-1 ml-5 list-disc text-sm">
                      <li>
                        PNG files maintain better quality during the
                        steganography process
                      </li>
                      <li>JPEG compression can damage hidden messages</li>
                      <li>
                        File size recommended under 4MB due to Vercel
                        limitations
                      </li>
                      <li>Larger files will affect processing speed</li>
                    </ul>
                  </>
                ) : (
                  <>
                    <span className="font-medium">File Requirements:</span> Use
                    steganography images under 4.5MB.
                    <span className="block mt-1">
                      Vercel has a 4.5MB upload limit. PNG format provides the
                      most reliable results.
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center justify-center w-full">
              <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-slate-300 border-dashed rounded-lg cursor-pointer bg-slate-50 dark:border-slate-600 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all">
                {previewUrl ? (
                  <div className="relative w-full h-full">
                    <Image
                      src={previewUrl}
                      alt="Preview"
                      fill
                      className="object-contain p-2 rounded-lg"
                    />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <ArrowUpTrayIcon className="w-10 h-10 text-slate-400" />
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                      <span className="font-semibold">Click to upload</span> or
                      drag and drop
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      PNG, JPG, or GIF (max: 4MB)
                    </p>
                  </div>
                )}
                <input
                  id="dropzone-file"
                  type="file"
                  className="hidden"
                  accept="image/png,image/jpeg,image/gif"
                  onChange={handleImageChange}
                  required
                />
              </label>
            </div>

            {/* Existing warning for large files */}
            {image && image.size > 4 * 1024 * 1024 && (
              <div className="mt-2 flex items-center gap-2 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2 rounded-md border border-amber-200 dark:border-amber-800">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 flex-shrink-0"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>
                  Warning: Image is{" "}
                  <strong>{(image.size / 1024 / 1024).toFixed(2)}MB</strong>.
                  Files larger than 4MB may fail to upload. The image will be
                  compressed automatically.
                </span>
              </div>
            )}
          </div>

          {/* Message Input (only for encode) */}
          {mode === "encode" && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Secret Message
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                placeholder="Enter your secret message here..."
                className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-800 dark:border-slate-600 dark:text-white dark:placeholder-slate-400"
                rows={4}
              />
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || !image}
            className={`w-full py-3 px-4 inline-flex justify-center items-center gap-2 rounded-md font-semibold bg-blue-500 text-white hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all dark:focus:ring-offset-slate-800 ${
              loading || !image ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            {loading ? (
              <>
                <svg
                  className="animate-spin h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Processing...
              </>
            ) : (
              <>{mode === "encode" ? "Hide Message" : "Extract Message"}</>
            )}
          </button>
        </form>

        {/* Results */}
        {error && (
          <div className="mt-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}

        {result && (
          <div className="mt-6 p-6 bg-white dark:bg-slate-800 rounded-lg shadow-md">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">
              {mode === "encode"
                ? "Message Hidden Successfully"
                : "Extracted Message"}
            </h2>

            {mode === "encode" && result.encoded_image && (
              <div className="space-y-4">
                <div className="relative h-[200px] w-full">
                  <Image
                    src={`data:image/png;base64,${result.encoded_image}`}
                    alt="Encoded Image"
                    fill
                    className="object-contain"
                  />
                </div>
                <button
                  onClick={handleDownload}
                  className="w-full py-2 px-4 inline-flex justify-center items-center gap-2 rounded-md border border-blue-500 font-semibold text-blue-500 hover:text-white hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all dark:focus:ring-offset-slate-800"
                >
                  <ArrowDownTrayIcon className="w-4 h-4" />
                  Download Image
                </button>
              </div>
            )}

            {mode === "decode" && result.message && (
              <div className="p-4 bg-slate-50 dark:bg-slate-700 rounded border border-slate-200 dark:border-slate-600">
                <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                  {result.message}
                </p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="w-full max-w-3xl text-center text-sm text-slate-500 dark:text-slate-400">
        <p>Steganography using DCT (Discrete Cosine Transform) Algorithm</p>
      </footer>
    </div>
  );
}
