"use client";

import { useQuery } from "convex/react";
import { useUser } from "@clerk/clerk-react";
import { api } from "../../convex/_generated/api";
import AddCourseDialog from "./AddCourseDialog";

export default function CourseSelection({ selectedCourseId, onCourseSelect }) {
  const { user } = useUser();

  const courses = useQuery(
    api.courses.getCourses,
    user?.id ? { userId: user.id } : "skip",
  );

  const handleCourseCreated = () => {
    // The courses query will automatically update due to Convex reactivity
  };

  if (!user) {
    return null;
  }

  return (
    <div className="bg-white border-b shadow-sm">
      <div className="max-w-4xl mx-auto px-6 py-4">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Courses</h2>

        <div className="flex flex-wrap gap-4">
          {courses && courses.length > 0 ? (
            <>
              {courses.map((course) => (
                <div
                  key={course._id}
                  onClick={() => onCourseSelect(course._id)}
                  className={`flex items-center justify-center p-4 rounded-lg cursor-pointer transition-colors min-h-[120px] min-w-[200px] ${
                    selectedCourseId === course._id
                      ? "bg-blue-100 border-2 border-blue-500 text-blue-700"
                      : "bg-gray-50 border-2 border-gray-200 hover:border-gray-300 text-gray-700"
                  }`}
                >
                  <div className="text-center">
                    <div className="font-medium">{course.name}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      Created {new Date(course.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
              <AddCourseDialog onCourseCreated={handleCourseCreated} />
            </>
          ) : (
            <div className="w-full">
              <div className="text-center py-8">
                <p className="text-gray-600 mb-4">
                  No courses yet. Create your first course to get started!
                </p>
              </div>
              <div className="flex justify-center">
                <AddCourseDialog onCourseCreated={handleCourseCreated} />
              </div>
            </div>
          )}
        </div>

        {selectedCourseId && courses && (
          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-700">
              <span className="font-medium">Selected course:</span>{" "}
              {courses.find((c) => c._id === selectedCourseId)?.name}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
