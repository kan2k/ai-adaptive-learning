import {
  getCourse,
  getCourseWithFiles,
  mergeLearningData,
} from "./db.js";

export function setStudentProgress(courseId, conceptKey, updates) {
  const course = getCourse(courseId);
  if (!course) throw new Error("Course not found");

  const currentLearningData = course.learningData || {};
  const currentProgress = currentLearningData.studentProgress || {};

  const existingConcept = currentProgress[conceptKey] || {
    mastery: "beginner",
    mistakes: 0,
    difficulty: "easy",
    needsReview: false,
    questionsCorrect: 0,
    questionsTotal: 0,
    percentage: 0,
    observation: "",
  };

  const updatedConcept = { ...existingConcept, ...updates };

  // Observations accumulate as a dated journal instead of being replaced
  if (updates.observation && updates.observation.trim() !== "") {
    const currentObservation = existingConcept.observation || "";
    const newObservation = updates.observation.trim();
    if (currentObservation === "") {
      updatedConcept.observation = newObservation;
    } else {
      const timestamp = new Date().toISOString().split("T")[0];
      updatedConcept.observation = `${currentObservation}\n[${timestamp}] ${newObservation}`;
    }
  }

  if (updates.percentage !== undefined) {
    updatedConcept.percentage = Math.max(0, Math.min(100, updates.percentage));
  }

  mergeLearningData(courseId, {
    studentProgress: {
      ...currentProgress,
      [conceptKey]: updatedConcept,
    },
  });

  return { success: true };
}

export function getStudentProgress(courseId) {
  const course = getCourse(courseId);
  if (!course) return {};
  return course.learningData?.studentProgress || {};
}

export function initializeStudentProgress(courseId) {
  const courseWithFiles = getCourseWithFiles(courseId);
  if (!courseWithFiles || !courseWithFiles.files) {
    throw new Error("Course or files not found");
  }

  const currentLearningData = courseWithFiles.learningData || {};
  const existingProgress = currentLearningData.studentProgress || {};

  const concepts = new Set();
  for (const file of courseWithFiles.files) {
    if (file.metadata && file.metadata.concepts) {
      for (const concept of file.metadata.concepts) {
        concepts.add(concept.title);
      }
    }
  }

  const updatedProgress = { ...existingProgress };
  let conceptsInitialized = 0;

  for (const conceptTitle of concepts) {
    if (!updatedProgress[conceptTitle]) {
      updatedProgress[conceptTitle] = {
        mastery: "beginner",
        mistakes: 0,
        difficulty: "easy",
        needsReview: false,
        questionsCorrect: 0,
        questionsTotal: 0,
        percentage: 0,
        observation: "",
      };
      conceptsInitialized++;
    }
  }

  mergeLearningData(courseId, { studentProgress: updatedProgress });

  return { success: true, conceptsInitialized };
}

export function getAllConcepts(courseId) {
  const courseWithFiles = getCourseWithFiles(courseId);
  if (!courseWithFiles || !courseWithFiles.files) return [];

  const concepts = new Set();
  for (const file of courseWithFiles.files) {
    if (file.metadata && file.metadata.concepts) {
      for (const concept of file.metadata.concepts) {
        concepts.add(concept.title);
      }
    }
  }
  return Array.from(concepts);
}

export function setNextQuestion(courseId, { originalQuestion, enhancedQuestion, message }) {
  const course = getCourse(courseId);
  if (!course) throw new Error("Course not found");

  mergeLearningData(courseId, {
    nextQuestion: {
      originalQuestion,
      enhancedQuestion,
      message,
      createdAt: Date.now(),
    },
  });
}

export function getFlashcardsByCourse(courseId) {
  const course = getCourse(courseId);
  if (!course) return [];
  return course.learningData?.flashcards || [];
}

export function addFlashcards(courseId, flashcards) {
  const course = getCourse(courseId);
  if (!course) throw new Error("Course not found");

  const newFlashcards = flashcards.map((f) => ({ ...f, createdAt: Date.now() }));
  const existingFlashcards = course.learningData?.flashcards || [];

  mergeLearningData(courseId, {
    flashcards: [...existingFlashcards, ...newFlashcards],
  });

  return { success: true, count: newFlashcards.length };
}

export function replaceFlashcards(courseId, flashcards) {
  const course = getCourse(courseId);
  if (!course) throw new Error("Course not found");

  const newFlashcards = flashcards.map((f) => ({ ...f, createdAt: Date.now() }));
  mergeLearningData(courseId, { flashcards: newFlashcards });

  return { success: true, count: newFlashcards.length };
}

export function getLearningData(courseId) {
  const course = getCourse(courseId);
  if (!course) return null;
  const learningData = course.learningData || {};
  return {
    nextQuestion: learningData.nextQuestion || null,
    studentProgress: learningData.studentProgress || {},
    flashcards: learningData.flashcards || [],
    knowledgeGraph: learningData.knowledgeGraph || null,
  };
}

export function buildMaterials(courseWithFiles) {
  const materials = [];
  for (const file of courseWithFiles.files) {
    if (file.metadata && file.metadata.concepts) {
      materials.push(`--- material: ${file.name}, fileId:${file._id} ---`);
      for (const concept of file.metadata.concepts) {
        materials.push(`${concept.title}: ${concept.reference}`);
      }
    }
  }
  return materials;
}
