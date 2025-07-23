/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as courses from "../courses.js";
import type * as files from "../files.js";
import type * as llm_generateLearning from "../llm/generateLearning.js";
import type * as llm_generateMetadata from "../llm/generateMetadata.js";
import type * as llm_pdfProcessor from "../llm/pdfProcessor.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  courses: typeof courses;
  files: typeof files;
  "llm/generateLearning": typeof llm_generateLearning;
  "llm/generateMetadata": typeof llm_generateMetadata;
  "llm/pdfProcessor": typeof llm_pdfProcessor;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
