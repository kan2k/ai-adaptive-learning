"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { BookOpen, Loader2 } from "lucide-react";

export default function generateMetadataButton({ courseId, courseName }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const generateMetadata = useAction(api.files.generateMetadata);

  const handleGenerate = async () => {
    if (!courseId) return;

    setIsGenerating(true);
    setError(null);
    setResult(null);

    try {
      const generationResult = await generateMetadata({ courseId });
      setResult(generationResult);
      console.log("Learning generation completed:", generationResult);
    } catch (err) {
      console.error("Learning generation failed:", err);
      setError(err.message || "Failed to generate learning content");
    } finally {
      setIsGenerating(false);
    }
  };

  if (!courseId) {
    return (
      <div className="text-center py-4">
        <p className="text-gray-500">
          Select a course to generate learning content
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">
            Learning Content Generation
          </h3>
          <p className="text-sm text-gray-600">
            Generate concepts and summaries from course materials
          </p>
        </div>

        <Button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="flex items-center gap-2"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <BookOpen className="w-4 h-4" />
              Generate Learning Content
            </>
          )}
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h4 className="text-red-800 font-medium">Generation Failed</h4>
          <p className="text-red-600 text-sm mt-1">{error}</p>
        </div>
      )}

      {result && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h4 className="text-green-800 font-medium mb-2">
            {result.message
              ? result.message
              : "Generation Completed Successfully!"}
          </h4>
          <div className="text-sm text-green-700 space-y-1">
            <p>
              <strong>Course:</strong> {result.courseName}
            </p>
            <p>
              <strong>Files Processed:</strong> {result.totalFilesProcessed}
            </p>
            {result.concepts.length > 0 && (
              <p>
                <strong>Total Concepts:</strong>{" "}
                {result.concepts.reduce(
                  (sum, file) => sum + file.concepts.length,
                  0,
                )}
              </p>
            )}
          </div>

          {result.concepts.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-green-800 font-medium">
                View Generated Concepts
              </summary>
              <div className="mt-2 space-y-4 max-h-96 overflow-y-auto">
                {result.concepts.map((fileResult, fileIndex) => (
                  <div key={fileIndex} className="bg-white rounded border p-3">
                    <h5 className="font-medium text-gray-800 mb-2">
                      📄 {fileResult.fileName}
                    </h5>

                    {/* File Metadata */}
                    {fileResult.fileMetadata && (
                      <div className="bg-gray-50 rounded p-3 mb-3">
                        <h6 className="text-sm font-medium text-gray-700 mb-2">
                          File Information
                        </h6>
                        <div className="space-y-1 text-sm">
                          <div>
                            <span className="font-medium">Area:</span>{" "}
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                              {fileResult.fileMetadata.relatedArea}
                            </span>
                          </div>
                          {fileResult.fileMetadata.author !== "Unknown" && (
                            <div>
                              <span className="font-medium">Author:</span>{" "}
                              {fileResult.fileMetadata.author}
                            </div>
                          )}
                          <div>
                            <span className="font-medium">Description:</span>{" "}
                            {fileResult.fileMetadata.description}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Concepts */}
                    <div className="space-y-3">
                      <h6 className="text-sm font-medium text-gray-700">
                        Learning Concepts
                      </h6>
                      {fileResult.concepts.map((concept, conceptIndex) => (
                        <div
                          key={conceptIndex}
                          className="border-l-2 border-blue-200 pl-3"
                        >
                          <h6 className="font-medium text-blue-800">
                            {concept.title}
                          </h6>
                          <p className="text-xs text-gray-600 italic mt-1">
                            "{concept.reference}"
                          </p>
                          <p className="text-sm text-gray-700 mt-1">
                            {concept.summary}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
