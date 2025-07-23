"use client";

import { useState } from "react";
import { SignInButton, UserButton, useUser } from "@clerk/clerk-react";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import CourseSelection from "../components/CourseSelection";
import UploadDropZone from "../components/UploadDropZone";
import UploadedFiles from "../components/UploadedFiles";
import GenerateMetadataButton from "../components/GenerateMetadataButton";

export default function Home() {
  const { user } = useUser();
  const [selectedCourseId, setSelectedCourseId] = useState(null);

  const handleCourseSelect = (courseId) => {
    setSelectedCourseId(courseId);
  };

  const handleUploadComplete = () => {
    // Files will automatically refresh due to Convex reactivity
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-6 py-4 flex justify-between items-center">
          <h1 className="text-xl font-semibold text-gray-800">
            AI Adaptive Learning
          </h1>
          <div className="flex items-center gap-4">
            <Authenticated>
              <span className="text-sm text-gray-600">
                {user?.emailAddresses[0]?.emailAddress}
              </span>
              <UserButton />
            </Authenticated>
            <Unauthenticated>
              <SignInButton />
            </Unauthenticated>
          </div>
        </div>
      </header>

      <Authenticated>
        <CourseSelection
          selectedCourseId={selectedCourseId}
          onCourseSelect={handleCourseSelect}
        />
      </Authenticated>

      <main className="py-8">
        <AuthLoading>
          <div className="flex justify-center items-center py-20">
            <p className="text-gray-600">Loading...</p>
          </div>
        </AuthLoading>

        <Unauthenticated>
          <div className="text-center py-20">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">
              Welcome to AI Adaptive Learning
            </h2>
            <p className="text-gray-600 mb-8">
              Please sign in to upload and manage your PDF files.
            </p>
            <SignInButton />
          </div>
        </Unauthenticated>

        <Authenticated>
          <div className="max-w-4xl mx-auto p-6 space-y-8">
            <div>
              <h2 className="text-2xl font-bold mb-6 text-gray-800">
                PDF File Upload
              </h2>

              <UploadDropZone
                courseId={selectedCourseId}
                onUploadComplete={handleUploadComplete}
              />

              <UploadedFiles courseId={selectedCourseId} />
            </div>

            <div className="border-t pt-8">
              <GenerateMetadataButton courseId={selectedCourseId} />
            </div>
          </div>
        </Authenticated>
      </main>
    </div>
  );
}
