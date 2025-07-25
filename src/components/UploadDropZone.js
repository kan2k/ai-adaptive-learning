"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useMutation } from "convex/react";
import { useUser } from "@clerk/clerk-react";
import { api } from "../../convex/_generated/api";

export default function UploadDropZone({ courseId, onUploadComplete }) {
  const { user } = useUser();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});

  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const saveFile = useMutation(api.files.saveFile);

  const onDrop = useCallback(
    async (acceptedFiles) => {
      if (!user || !courseId) return;

      setIsUploading(true);

      for (const file of acceptedFiles) {
        try {
          setUploadProgress((prev) => ({ ...prev, [file.name]: 0 }));

          // Generate upload URL
          const uploadUrl = await generateUploadUrl();

          setUploadProgress((prev) => ({ ...prev, [file.name]: 30 }));

          // Upload file to Convex storage
          const response = await fetch(uploadUrl, {
            method: "POST",
            headers: { "Content-Type": file.type },
            body: file,
          });

          if (!response.ok) {
            throw new Error("Upload failed");
          }

          const { storageId } = await response.json();
          setUploadProgress((prev) => ({ ...prev, [file.name]: 75 }));

          // Save file metadata to database
          await saveFile({
            storageId,
            name: file.name,
            type: file.type,
            size: file.size,
            courseId,
          });

          setUploadProgress((prev) => ({ ...prev, [file.name]: 100 }));

          // Remove progress after a delay
          setTimeout(() => {
            setUploadProgress((prev) => {
              const newProgress = { ...prev };
              delete newProgress[file.name];
              return newProgress;
            });
          }, 2000);
        } catch (error) {
          console.error("Upload failed:", error);
          setUploadProgress((prev) => {
            const newProgress = { ...prev };
            delete newProgress[file.name];
            return newProgress;
          });
        }
      }

      setIsUploading(false);
      onUploadComplete?.();
    },
    [user, courseId, generateUploadUrl, saveFile, onUploadComplete],
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
                Drop materials here...
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Upload Progress */}
      {Object.keys(uploadProgress).length > 0 && (
        <div className="mt-4 space-y-2">
          {Object.entries(uploadProgress).map(([fileName, progress]) => (
            <div key={fileName} className="bg-gray-100 rounded p-3">
              <div className="flex justify-between text-sm mb-1">
                <span className="truncate">{fileName}</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
