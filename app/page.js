"use client";
import Image from "next/image";
import { useState } from "react";
import {
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  LockClosedIcon,
  LockOpenIcon,
} from "@heroicons/react/24/outline";
import { CircleAlert } from "lucide-react";
import { upload } from "@vercel/blob/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";

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
    setImage(null);
    setPreviewUrl(null);
    setMessage("");
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
    <div className="min-h-screen p-8 pb-20 space-y-8 bg-background">
      <div className="container max-w-3xl mx-auto space-y-8">
        {/* Header */}
        <header className="text-center space-y-4">
          <h1 className="text-5xl font-bold tracking-tight">Kalupto</h1>
          <p className="text-muted-foreground">
            A powerful steganography tool that securely embeds your secret
            messages within images using advanced DCT algorithm
          </p>
        </header>

        {/* Main Content */}
        <Card>
          <CardHeader>
            <Tabs defaultValue="encode" onValueChange={handleModeChange}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="encode">Encode Message</TabsTrigger>
                <TabsTrigger value="decode">Decode Message</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent className="mt-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Image Upload Info */}
              <Alert>
                <AlertDescription>
                  {mode === "encode" ? (
                    <>
                      <span className="font-medium">Recommended Format:</span>{" "}
                      Use <strong>PNG</strong> for best results.
                      <ul className="mt-1 ml-5 list-disc text-sm">
                        <li>
                          PNG files maintain better quality during steganography
                        </li>
                        <li>JPEG compression can damage hidden messages</li>
                        <li>File size recommended under 4MB</li>
                      </ul>
                    </>
                  ) : (
                    <>
                      <span className="font-medium">File Requirements:</span>{" "}
                      Use steganography images under 4.5MB. PNG format provides
                      the most reliable results.
                    </>
                  )}
                </AlertDescription>
              </Alert>

              {/* Image Upload */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Upload Image</label>
                <div className="flex items-center justify-center w-full">
                  <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-lg cursor-pointer hover:bg-accent transition-colors">
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
                        <ArrowUpTrayIcon className="w-10 h-10 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          <span className="font-semibold">Click to upload</span>{" "}
                          or drag and drop
                        </p>
                      </div>
                    )}
                    <input
                      type="file"
                      className="hidden"
                      accept="image/png,image/jpeg,image/gif"
                      onChange={handleImageChange}
                      required
                    />
                  </label>
                </div>
              </div>

              {/* File Size Warning */}
              {image && image.size > 4 * 1024 * 1024 && (
                <Alert variant="warning" className="bg-yellow-100">
                  <CircleAlert />
                  <AlertDescription>
                    Warning: Image is {(image.size / 1024 / 1024).toFixed(2)}MB.
                    Files larger than 4MB may fail to upload. The image will be
                    compressed automatically.
                  </AlertDescription>
                </Alert>
              )}

              {/* Message Input (encode only) */}
              {mode === "encode" && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Secret Message</label>
                  <Textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Enter your secret message here..."
                    required
                    rows={4}
                  />
                </div>
              )}

              {/* Submit Button */}
              <Button
                type="submit"
                disabled={loading || !image}
                className="w-full"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-4 w-4 mr-2" /* ... */ />
                    Processing...
                  </>
                ) : mode === "encode" ? (
                  "Hide Message"
                ) : (
                  "Extract Message"
                )}
              </Button>
            </form>

            {/* Error Display */}
            {error && (
              <Alert variant="destructive" className="mt-6">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Results */}
            {result && (
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle>
                    {mode === "encode"
                      ? "Message Hidden Successfully"
                      : "Extracted Message"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {mode === "encode" && result.encoded_image ? (
                    <div className="space-y-4">
                      <div className="relative h-[200px] w-full">
                        <Image
                          src={`data:image/png;base64,${result.encoded_image}`}
                          alt="Encoded Image"
                          fill
                          className="object-contain"
                        />
                      </div>
                      <Button
                        variant="outline"
                        onClick={handleDownload}
                        className="w-full"
                      >
                        <ArrowDownTrayIcon className="w-4 h-4 mr-2" />
                        Download Image
                      </Button>
                    </div>
                  ) : (
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="whitespace-pre-wrap">{result.message}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>

        {/* Footer */}
        <footer className="text-center text-sm text-muted-foreground">
          <p>Steganography using DCT (Discrete Cosine Transform) Algorithm</p>
        </footer>
      </div>
    </div>
  );
}
