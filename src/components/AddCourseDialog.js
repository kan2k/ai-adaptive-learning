"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { useUser } from "@clerk/clerk-react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";

export default function AddCourseDialog({ onCourseCreated }) {
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  const [courseName, setCourseName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const createCourse = useMutation(api.courses.createCourse);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!courseName.trim() || !user) return;

    setIsLoading(true);
    setError("");

    try {
      await createCourse({
        name: courseName.trim(),
        createdBy: user.id,
      });

      setCourseName("");
      setOpen(false);
      onCourseCreated?.();
    } catch (error) {
      setError(error.message || "Failed to create course");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-gray-400 transition-colors min-h-[120px]">
          <Plus className="w-8 h-8 text-gray-400 mb-2" />
          <span className="text-gray-600 font-medium">Add Course</span>
        </div>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create New Course</DialogTitle>
            <DialogDescription>
              Enter a unique name for your course. This will help you organize
              your PDF files.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="course-name" className="text-right">
                Name
              </label>
              <input
                id="course-name"
                value={courseName}
                onChange={(e) => setCourseName(e.target.value)}
                placeholder="Enter course name"
                className="col-span-3 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>
            {error && (
              <p className="text-sm text-red-600 col-span-4">{error}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !courseName.trim()}>
              {isLoading ? "Creating..." : "Create Course"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
