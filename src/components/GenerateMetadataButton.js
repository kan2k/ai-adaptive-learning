"use client";

import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { BookOpen, Loader2, FileText, Users } from "lucide-react";

export default function GenerateMetadataButton({ courseId, courseName }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const generateMetadata = useAction(api.files.generateMetadata);

  // Fetch existing files and their concepts
  const files = useQuery(api.files.getFiles, courseId ? { courseId } : "skip");

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

  // Calculate statistics about existing concepts
  const filesWithConcepts =
    files?.filter((file) => file.metadata?.concepts?.length > 0) || [];
  const totalConcepts = filesWithConcepts.reduce(
    (sum, file) => sum + (file.metadata?.concepts?.length || 0),
    0,
  );
  const filesWithoutConcepts =
    files?.filter((file) => !file.metadata?.concepts?.length) || [];

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
          disabled={isGenerating || !files?.length}
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
              Generate Concepts
            </>
          )}
        </Button>
      </div>

      {/* Statistics Section */}
      {files && files.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              <div>
                <p className="text-sm font-medium text-blue-800">Total Files</p>
                <p className="text-2xl font-bold text-blue-900">
                  {files.length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-green-600" />
              <div>
                <p className="text-sm font-medium text-green-800">
                  Files with Concepts
                </p>
                <p className="text-2xl font-bold text-green-900">
                  {filesWithConcepts.length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-purple-600" />
              <div>
                <p className="text-sm font-medium text-purple-800">
                  Total Concepts
                </p>
                <p className="text-2xl font-bold text-purple-900">
                  {totalConcepts}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Files needing concept generation */}
      {filesWithoutConcepts.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h4 className="text-yellow-800 font-medium mb-2">
            Files Needing Concept Generation ({filesWithoutConcepts.length})
          </h4>
          <div className="space-y-1">
            {filesWithoutConcepts.map((file) => (
              <p key={file._id} className="text-yellow-700 text-sm">
                📄 {file.name}
              </p>
            ))}
          </div>
        </div>
      )}

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
        </div>
      )}

      {/* Existing Concepts Display */}
      {filesWithConcepts.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h4 className="text-gray-800 font-medium mb-3">
            Existing Concepts ({totalConcepts} concepts from{" "}
            {filesWithConcepts.length} files)
          </h4>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {filesWithConcepts.map((file) => (
              <div key={file._id} className="bg-white rounded border p-3">
                <h5 className="font-medium text-gray-800 mb-2">
                  📄 {file.name}
                </h5>

                {/* File Metadata */}
                {file.metadata && (
                  <div className="bg-gray-50 rounded p-3 mb-3">
                    <h6 className="text-sm font-medium text-gray-700 mb-2">
                      File Information
                    </h6>
                    <div className="space-y-1 text-sm">
                      <div>
                        <span className="font-medium">Area:</span>{" "}
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                          {file.metadata.relatedArea}
                        </span>
                      </div>
                      {file.metadata.author !== "Unknown" && (
                        <div>
                          <span className="font-medium">Author:</span>{" "}
                          {file.metadata.author}
                        </div>
                      )}
                      <div>
                        <span className="font-medium">Description:</span>{" "}
                        {file.metadata.description}
                      </div>
                    </div>
                  </div>
                )}

                {/* Concepts */}
                <div className="space-y-3">
                  <h6 className="text-sm font-medium text-gray-700">
                    Learning Concepts ({file.metadata.concepts.length})
                  </h6>
                  {file.metadata.concepts.map((concept, conceptIndex) => (
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
        </div>
      )}
    </div>
  );
}
