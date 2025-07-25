"use client";

import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Brain,
  Loader2,
  BookOpen,
  HelpCircle,
  CheckCircle,
} from "lucide-react";

export default function GenerateLearningButton({ courseId, courseName }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const generateLearning = useAction(api.courses.generateLearning);

  // Fetch existing learning data
  const learningDataResult = useQuery(
    api.courses.getLearningData,
    courseId ? { courseId } : "skip",
  );
  const files = useQuery(api.files.getFiles, courseId ? { courseId } : "skip");

  const handleGenerate = async () => {
    if (!courseId) return;

    setIsGenerating(true);
    setError(null);
    setResult(null);

    try {
      const generationResult = await generateLearning({ courseId });
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

  const hasLearningData = learningDataResult?.hasLearningData;
  const learningData = learningDataResult?.learningData;

  // Calculate statistics
  const totalMemoryBlocks = learningData?.memoryBlocks?.length || 0;
  const totalQuestions = learningData?.questions?.length || 0;
  const easyQuestions =
    learningData?.questions?.filter((q) => q.difficulty === "easy").length || 0;
  const hardQuestions =
    learningData?.questions?.filter((q) => q.difficulty === "hard").length || 0;
  const readMemoryBlocks =
    learningData?.memoryBlocks?.filter((b) => b.isRead).length || 0;

  // Check if files have concepts (required for learning generation)
  const filesWithConcepts =
    files?.filter((file) => file.metadata?.concepts?.length > 0) || [];
  const canGenerate = filesWithConcepts.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">
            Adaptive Learning Generation
          </h3>
          <p className="text-sm text-gray-600">
            Generate memory blocks and adaptive questions from course concepts
          </p>
        </div>

        <Button
          onClick={handleGenerate}
          disabled={isGenerating || !canGenerate}
          className="flex items-center gap-2"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Brain className="w-4 h-4" />
              {hasLearningData ? "Regenerate" : "Generate"} Learning Content
            </>
          )}
        </Button>
      </div>

      {/* Prerequisites Check */}
      {!canGenerate && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h4 className="text-yellow-800 font-medium">
            Prerequisites Required
          </h4>
          <p className="text-yellow-700 text-sm mt-1">
            Please generate concepts first by going to the "Generate Concepts"
            tab.
            {files?.length === 0
              ? " No files found in this course."
              : ` Found ${filesWithConcepts.length} of ${files?.length} files with concepts.`}
          </p>
        </div>
      )}

      {/* Statistics Section */}
      {hasLearningData && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-blue-600" />
              <div>
                <p className="text-sm font-medium text-blue-800">
                  Memory Blocks
                </p>
                <p className="text-2xl font-bold text-blue-900">
                  {totalMemoryBlocks}
                </p>
                <p className="text-xs text-blue-600">{readMemoryBlocks} read</p>
              </div>
            </div>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-green-600" />
              <div>
                <p className="text-sm font-medium text-green-800">
                  Total Questions
                </p>
                <p className="text-2xl font-bold text-green-900">
                  {totalQuestions}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-orange-600" />
              <div>
                <p className="text-sm font-medium text-orange-800">
                  Easy Questions
                </p>
                <p className="text-2xl font-bold text-orange-900">
                  {easyQuestions}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-red-600" />
              <div>
                <p className="text-sm font-medium text-red-800">
                  Hard Questions
                </p>
                <p className="text-2xl font-bold text-red-900">
                  {hardQuestions}
                </p>
              </div>
            </div>
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
            Learning Content Generated Successfully!
          </h4>
          <div className="text-sm text-green-700 space-y-1">
            <p>
              <strong>Course:</strong> {result.courseName}
            </p>
            <p>
              <strong>Memory Blocks:</strong> {result.totalMemoryBlocks}
            </p>
            <p>
              <strong>Total Questions:</strong> {result.totalQuestions}
            </p>
            <p>
              <strong>Easy Questions:</strong>{" "}
              {result.questionsByDifficulty.easy}
            </p>
            <p>
              <strong>Hard Questions:</strong>{" "}
              {result.questionsByDifficulty.hard}
            </p>
          </div>
        </div>
      )}

      {/* Existing Learning Content Display */}
      {hasLearningData && learningData && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h4 className="text-gray-800 font-medium mb-3">
            Generated Learning Content
          </h4>

          {/* Memory Blocks Preview */}
          {totalMemoryBlocks > 0 && (
            <div className="mb-4">
              <h5 className="text-sm font-medium text-gray-700 mb-2">
                Memory Blocks ({totalMemoryBlocks})
              </h5>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {learningData.memoryBlocks.slice(0, 3).map((block, index) => (
                  <div key={index} className="bg-white rounded p-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${block.isRead ? "bg-green-500" : "bg-gray-300"}`}
                      ></span>
                      <span className="font-medium text-blue-800">
                        {block.conceptTitle}
                      </span>
                    </div>
                    <p className="text-gray-600 mt-1 text-xs">
                      {block.memoryCard}
                    </p>
                  </div>
                ))}
                {totalMemoryBlocks > 3 && (
                  <p className="text-xs text-gray-500 text-center">
                    ... and {totalMemoryBlocks - 3} more memory blocks
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Questions Preview */}
          {totalQuestions > 0 && (
            <div>
              <h5 className="text-sm font-medium text-gray-700 mb-2">
                Questions ({totalQuestions})
              </h5>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {learningData.questions.slice(0, 3).map((question, index) => (
                  <div key={index} className="bg-white rounded p-2 text-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          question.difficulty === "easy"
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {question.difficulty}
                      </span>
                      <span className="text-blue-800 font-medium">
                        {question.conceptTitle}
                      </span>
                    </div>
                    <p className="text-gray-600 text-xs">
                      {question.originalQuestion}
                    </p>
                  </div>
                ))}
                {totalQuestions > 3 && (
                  <p className="text-xs text-gray-500 text-center">
                    ... and {totalQuestions - 3} more questions
                  </p>
                )}
              </div>
            </div>
          )}

          {learningData.generatedAt && (
            <p className="text-xs text-gray-500 mt-3">
              Generated on {new Date(learningData.generatedAt).toLocaleString()}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
