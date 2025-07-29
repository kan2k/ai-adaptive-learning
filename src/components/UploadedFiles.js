"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Trash, Check } from "lucide-react";
import { Spinner } from "./ui/spinner";
import { Checkbox } from "./ui/checkbox";

export default function UploadedFiles({ courseId }) {
  const removeFile = useMutation(api.courses.removeFile);
  const toggleFileSelection = useMutation(api.courses.toggleFileSelection);

  const files = useQuery(api.files.getFiles, courseId ? { courseId } : "skip");
  const selectedFileIds = useQuery(
    api.courses.getSelectedFiles,
    courseId ? { courseId } : "skip",
  );

  const handleRemove = async (fileId) => {
    if (!courseId) return;

    try {
      await removeFile({ courseId, fileId });
    } catch (error) {
      console.error("Remove failed:", error);
    }
  };

  const handleFileSelect = async (fileId) => {
    const file = files?.find((f) => f._id === fileId);
    if (file?.metadata?.status !== "success") return;

    try {
      await toggleFileSelection({ courseId, fileId });
    } catch (error) {
      console.error("Toggle selection failed:", error);
    }
  };

  if (!courseId) {
    return (
      <div className="text-center py-8 bg-gray-50 rounded-lg">
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
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <p className="text-gray-400">Select a course to view files</p>
      </div>
    );
  }

  return (
    <div className="">
      {/* <h3 className="text-lg font-semibold mb-4">
        Course Material ({files?.length || 0})
      </h3> */}

      {files && files.length > 0 ? (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <tbody className="divide-y">
                {files.map((file) => {
                  const isSelected =
                    selectedFileIds?.includes(file._id) || false;
                  const hasMetadata = !!file.metadata;
                  const isSelectable = hasMetadata;

                  return (
                    <tr
                      key={file._id}
                      className="cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() =>
                        isSelectable ? handleFileSelect(file._id) : undefined
                      }
                    >
                      <td className="p-4 whitespace-nowrap">
                        <div className="flex items-start">
                          <div className="w-5 h-5 mr-3 mt-0.5 flex items-center justify-center">
                            {file.metadata?.status === "processing" ? (
                              <Spinner size="sm" className="text-gray-400" />
                            ) : (
                              <Checkbox
                                checked={isSelected}
                                disabled={file.metadata?.status !== "success"}
                              />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-bold font-[Menco] text-gray-900 flex flex-row gap-2 truncate">
                              {file.name}
                              {/* {file.metadata?.relatedArea && (
                                <span className="inline-flex items-center px-2 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                  {file.metadata.relatedArea}
                                </span>
                              )} */}
                              {/* {file.metadata.author != "Unknown" && (
                                <span className="inline-flex items-center px-2  rounded text-xs font-medium bg-blue-100 text-blue-800">
                                  {file.metadata.author}
                                </span>
                              )} */}
                            </div>
                            {file.metadata ? (
                              <>
                                {file.metadata.description && (
                                  <div className="text-xs text-gray-600 font-medium line-clamp-2 whitespace-pre-wrap leading-3">
                                    {file.metadata.description}
                                  </div>
                                )}
                              </>
                            ) : (
                              <div className="text-xs text-gray-500 italic"></div>
                            )}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation(); // Prevent row click when clicking delete
                              handleRemove(file._id);
                            }}
                            className="text-red-600 hover:cursor-pointer hover:bg-red-100 rounded-full p-2 hover:text-red-900 transition-colors flex items-center justify-center"
                          >
                            <Trash className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div />
      )}
    </div>
  );
}
