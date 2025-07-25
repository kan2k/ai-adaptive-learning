import { useUser } from "@clerk/clerk-react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Book, Check, ChevronDownIcon, PlusIcon } from "lucide-react";
import { UserButton } from "@clerk/clerk-react";

export function Navbar({ courses, selectedCourse, setSelectedCourse }) {
  const { user } = useUser();
  const createCourse = useMutation(api.courses.createCourse);
  const updateLastOpened = useMutation(api.courses.updateLastOpened);

  const handleCreateCourse = async () => {
    if (!user?.id) {
      console.error("User not authenticated");
      return;
    }

    try {
      const courseId = await createCourse({
        createdBy: user.id,
      });

      // The course will be automatically selected when the courses query updates
      console.log("Course created:", courseId);
    } catch (error) {
      console.error("Failed to create course:", error);
    }
  };

  const handleCourseSelect = (course) => {
    updateLastOpened({ courseId: course._id, userId: user.id });
    setSelectedCourse(course);
  };

  return (
    <div className="bg-blue-500 border-blue-400 border-b-2 rounded-b-[48px] h-16 flex flex-row items-center text-2xl font-bold">
      <div className="h-full w-full flex flex-row items-center justify-between px-8">
        <div className="flex flex-row items-center gap-8">
          <Book className="h-6 w-6 text-white" />
          <DropdownMenu>
            <DropdownMenuTrigger className="bg-white px-4 w-[180px] py-1 rounded-full flex items-center gap-2 hover:bg-gray-50 transition-colors justify-center">
              My Courses
              <ChevronDownIcon className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="p-3 w-[180px]">
              <div className="space-y-2">
                <DropdownMenuItem
                  className="cursor-pointer p-4 rounded-[12px] border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 transition-colors h-[60px]"
                  onClick={handleCreateCourse}
                >
                  <div className="flex items-center justify-center w-full h-full gap-1">
                    <PlusIcon className="h-5 w-5" />
                  </div>
                </DropdownMenuItem>

                {courses &&
                  courses.length > 0 &&
                  courses.map((course) => (
                    <DropdownMenuItem
                      key={course._id}
                      className="h-[60px] cursor-pointer py-4 rounded-[12px] border hover:bg-gray-50 transition-colors"
                      onClick={() => handleCourseSelect(course)}
                    >
                      <div className="font-[Menco] text-sm w-full h-full flex flex-col items-center justify-center">
                        <span className="leading-4 font-bold">
                          {course.name}
                        </span>
                      </div>
                    </DropdownMenuItem>
                  ))}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex flex-row rounded-full border-2 border-white">
          <UserButton />
        </div>
      </div>
    </div>
  );
}
