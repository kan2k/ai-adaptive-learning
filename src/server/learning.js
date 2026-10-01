import {
  getCourse,
  getCourseWithFiles,
  mergeLearningData,
  listFlashcards,
  insertFlashcards,
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

// Resolves a concept title back to the file (and markdown heading) its
// metadata extraction came from, so questions and flashcards can cite it.
export function findConceptSource(courseId, conceptTitle) {
  if (!conceptTitle) return null;
  const courseWithFiles = getCourseWithFiles(courseId);
  if (!courseWithFiles) return null;
  const target = conceptTitle.toLowerCase().trim();
  for (const file of courseWithFiles.files) {
    for (const concept of file.metadata?.concepts || []) {
      if ((concept.title || "").toLowerCase().trim() === target) {
        return {
          fileId: file._id,
          fileName: file.name,
          heading: concept.sourceHeading,
        };
      }
    }
  }
  return null;
}

export function setNextQuestion(courseId, { originalQuestion, enhancedQuestion, message }) {
  const course = getCourse(courseId);
  if (!course) throw new Error("Course not found");

  mergeLearningData(courseId, {
    nextQuestion: {
      originalQuestion,
      enhancedQuestion,
      message,
      source:
        findConceptSource(courseId, enhancedQuestion?.conceptCovered) ||
        undefined,
      createdAt: Date.now(),
    },
  });
}

export function getFlashcardsByCourse(courseId) {
  const course = getCourse(courseId);
  if (!course) return [];
  return listFlashcards(courseId);
}

export function addFlashcards(courseId, flashcards) {
  const course = getCourse(courseId);
  if (!course) throw new Error("Course not found");

  const count = insertFlashcards(courseId, flashcards);
  return { success: true, count };
}

// Pre-generation runs on every course start; cards whose concept already has
// one keep their FSRS review state instead of being wiped and re-inserted.
export function replaceFlashcards(courseId, flashcards) {
  const course = getCourse(courseId);
  if (!course) throw new Error("Course not found");

  const existingConcepts = new Set(
    listFlashcards(courseId).map((c) => c.conceptTitle.toLowerCase().trim()),
  );
  const fresh = flashcards.filter(
    (f) => !existingConcepts.has((f.conceptTitle || "").toLowerCase().trim()),
  );
  const count = fresh.length > 0 ? insertFlashcards(courseId, fresh) : 0;
  return { success: true, count };
}

export function getLearningData(courseId) {
  const course = getCourse(courseId);
  if (!course) return null;
  const learningData = course.learningData || {};
  return {
    nextQuestion: learningData.nextQuestion || null,
    studentProgress: learningData.studentProgress || {},
    flashcards: listFlashcards(courseId),
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
