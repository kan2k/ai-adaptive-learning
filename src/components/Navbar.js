import { apiFetch } from "@/lib/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Book, Check, ChevronDownIcon, PlusIcon, Settings } from "lucide-react";
import { Preferences } from "./Preferences";
import { LLMSettings } from "./LLMSettings";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogTrigger,
} from "@/components/ui/dialog";
import { X } from "lucide-react";

export function Navbar({
  courses,
  selectedCourse,
  setSelectedCourse,
  createCourse,
}) {
  const handleCreateCourse = async () => {
    try {
      const newCourse = await createCourse();
      await apiFetch(`/api/courses/${newCourse._id}`, {
        method: "PATCH",
        body: { opened: true },
      });
      setSelectedCourse(newCourse);

      console.log("Course created and selected:", newCourse._id);
    } catch (error) {
      console.error("Failed to create course:", error);
    }
  };

  const handleCourseSelect = async (course) => {
    await apiFetch(`/api/courses/${course._id}`, {
      method: "PATCH",
      body: { opened: true },
    });
    setSelectedCourse(course);
  };

  return (
    <div className="bg-blue-500 outline-blue-400 outline-4 rounded-b-[48px] h-16 flex flex-row items-center text-xl font-bold">
      <div className="h-full w-full flex flex-row items-center justify-between px-8">
        <div className="flex flex-row items-center gap-8">
          <Book className="h-6 w-6 text-white" />
          <DropdownMenu>
            <DropdownMenuTrigger className="bg-white px-2 w-[160px] py-1 rounded-full flex items-center gap-2 hover:bg-gray-50 transition-colors justify-center hover:cursor-pointer mt-0.5">
              My Courses
              <ChevronDownIcon className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="p-2">
              <div className="space-y-1">
                {courses && courses.length > 0 ? (
                  <div className="flex gap-1">
                    {Array.from(
                      { length: Math.ceil((courses.length + 1) / 4) },
                      (_, columnIndex) => (
                        <div
                          key={columnIndex}
                          className="flex flex-col space-y-1"
                        >
                          {columnIndex === 0 && (
                            <DropdownMenuItem
                              className="cursor-pointer p-4 rounded-[12px] border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 transition-colors h-[60px] w-[140px]"
                              onClick={handleCreateCourse}
                            >
                              <div className="flex items-center justify-center w-full h-full gap-1">
                                <PlusIcon className="h-5 w-5" />
                              </div>
                            </DropdownMenuItem>
                          )}
                          {courses
                            .slice(
                              columnIndex === 0 ? 0 : columnIndex * 4 - 1,
                              columnIndex === 0 ? 3 : columnIndex * 4 + 3,
                            )
                            .map((course) => (
                              <DropdownMenuItem
                                key={course._id}
                                className="h-[60px] w-[140px] cursor-pointer py-4 rounded-[12px] border hover:bg-gray-50 transition-colors"
                                onClick={() => handleCourseSelect(course)}
                              >
                                <div className="font-[Menco] text-sm w-full h-full flex flex-col items-center justify-center">
                                  <span className="font-bold">
                                    {course.name}
                                  </span>
                                </div>
                              </DropdownMenuItem>
                            ))}
                        </div>
                      ),
                    )}
                  </div>
                ) : (
                  <DropdownMenuItem
                    className="cursor-pointer p-4 rounded-[12px] border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 transition-colors h-[60px] w-[160px]"
                    onClick={handleCreateCourse}
                  >
                    <div className="flex items-center justify-center w-full h-full gap-1">
                      <PlusIcon className="h-5 w-5" />
                    </div>
                  </DropdownMenuItem>
                )}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <Dialog>
            <DialogTrigger asChild>
              <button className="bg-white px-2 w-[160px] py-1 rounded-full flex items-center gap-2 hover:bg-gray-50 transition-colors justify-center hover:cursor-pointer mt-0.5">
                <div className="">Preferences</div>
              </button>
            </DialogTrigger>
            <DialogContent className="w-full min-w-[820px] flex flex-col">
              <DialogHeader className="">
                <DialogTitle className="flex flex-row gap-2 justify-between items-center">
                  <div className="text-2xl font-bold">Study Preferences</div>
                  <DialogClose asChild>
                    <X
                      className="size-6 hover:cursor-pointer hover:scale-105"
                      onClick={() => {}}
                    />
                  </DialogClose>
                </DialogTitle>
              </DialogHeader>
              <Preferences />
            </DialogContent>
          </Dialog>
        </div>

        <Dialog>
          <DialogTrigger asChild>
            <button
              title="AI settings"
              className="bg-white p-2 rounded-full flex items-center justify-center hover:bg-gray-50 transition-colors hover:cursor-pointer mt-0.5"
            >
              <Settings className="h-5 w-5" />
            </button>
          </DialogTrigger>
          <DialogContent className="w-full min-w-[560px] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex flex-row gap-2 justify-between items-center">
                <div className="text-2xl font-bold">AI Settings</div>
                <DialogClose asChild>
                  <X className="size-6 hover:cursor-pointer hover:scale-105" />
                </DialogClose>
              </DialogTitle>
            </DialogHeader>
            <LLMSettings />
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
