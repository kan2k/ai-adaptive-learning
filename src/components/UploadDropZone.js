"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useMutation } from "convex/react";
import { useUser } from "@clerk/clerk-react";
import { api } from "../../convex/_generated/api";

// Function to extract text from PDF file
const extractTextFromPDF = async (file) => {
  // Dynamically import pdfjs-dist only when needed (client-side)
  const pdfjsLib = await import("pdfjs-dist");

  // Configure PDF.js worker - use local worker file
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/js/pdf.worker.min.js";

  return new Promise((resolve, reject) => {
    const fileReader = new FileReader();

    fileReader.onload = async function () {
      try {
        const typedarray = new Uint8Array(this.result);
        const pdf = await pdfjsLib.getDocument(typedarray).promise;

        let fullText = "";

        // Extract text from each page
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item) => item.str).join(" ");
          fullText += pageText + "\n\n";
        }

        resolve(fullText.trim());
      } catch (error) {
        reject(error);
      }
    };

    fileReader.onerror = () => reject(new Error("Failed to read file"));
    fileReader.readAsArrayBuffer(file);
  });
};

export default function UploadDropZone({ courseId, onUploadComplete }) {
  const { user } = useUser();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [progressStages, setProgressStages] = useState({});

  const saveTextFile = useMutation(api.files.saveTextFile);

  const getProgressStage = (progress) => {
    if (progress < 20) return "Starting...";
    if (progress < 60) return "Extracting text...";
    if (progress < 100) return "Saving content...";
    return "Complete!";
  };

  const onDrop = useCallback(
    async (acceptedFiles) => {
      if (!user || !courseId) return;

      setIsUploading(true);

      for (const file of acceptedFiles) {
        try {
          setUploadProgress((prev) => ({ ...prev, [file.name]: 0 }));
          setProgressStages((prev) => ({
            ...prev,
            [file.name]: "Starting...",
          }));

          // Extract text from PDF
          console.log(`Extracting text from: ${file.name}`);
          setUploadProgress((prev) => ({ ...prev, [file.name]: 20 }));
          setProgressStages((prev) => ({
            ...prev,
            [file.name]: "Extracting text...",
          }));

          const textContent = await extractTextFromPDF(file);
          console.log(
            `Text extracted, length: ${textContent.length} characters`,
          );
          setUploadProgress((prev) => ({ ...prev, [file.name]: 60 }));
          setProgressStages((prev) => ({
            ...prev,
            [file.name]: "Saving content...",
          }));

          // Save text content to database
          await saveTextFile({
            name: file.name,
            textContent: textContent,
            originalSize: file.size,
            courseId,
          });

          setUploadProgress((prev) => ({ ...prev, [file.name]: 100 }));
          setProgressStages((prev) => ({ ...prev, [file.name]: "Complete!" }));

          // Remove progress after a delay
          setTimeout(() => {
            setUploadProgress((prev) => {
              const newProgress = { ...prev };
              delete newProgress[file.name];
              return newProgress;
            });
            setProgressStages((prev) => {
              const newStages = { ...prev };
              delete newStages[file.name];
              return newStages;
            });
          }, 2000);
        } catch (error) {
          console.error("Text extraction or upload failed:", error);
          setUploadProgress((prev) => {
            const newProgress = { ...prev };
            delete newProgress[file.name];
            return newProgress;
          });
          setProgressStages((prev) => {
            const newStages = { ...prev };
            delete newStages[file.name];
            return newStages;
          });

          // Show error to user
          alert(`Failed to process ${file.name}: ${error.message}`);
        }
      }

      setIsUploading(false);
      onUploadComplete?.();
    },
    [user, courseId, saveTextFile, onUploadComplete],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
    },
    multiple: true,
    disabled: !courseId,
  });

  if (!courseId) {
    return (
      <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center">
        <svg
          className="w-12 h-12 text-gray-300 mx-auto mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
        <p className="text-gray-400">Select a course to upload files</p>
      </div>
    );
  }

  return (
    <div>
      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg px-8 py-4 text-center cursor-pointer transition-colors ${
          isDragActive
            ? "border-orange-400 bg-orange-50"
            : "border-orange-500 hover:border-orange-400"
        }`}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-2">
          <svg
            className="w-8 h-8 text-orange-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          {isDragActive ? (
            <p className="text-orange-500 font-medium text-base">
              Drop the PDF files here...
            </p>
          ) : (
            <div>
              <p className="text-orange-500 font-medium text-base">
                Drop PDF files here...
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Upload Progress */}
      {Object.keys(uploadProgress).length > 0 && (
        <div className="mt-4 space-y-2">
          {Object.entries(uploadProgress).map(([fileName, progress]) => (
            <div key={fileName} className="p-3 flex flex-col gap-1">
              <div className="flex items-center justify-between text-sm">
                <span className="truncate font-medium">{fileName}</span>
                <span>{progress}%</span>
              </div>
              <div
                className="bg-orange-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
