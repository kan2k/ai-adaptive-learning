import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useState, useEffect } from "react";
import { Check, X } from "lucide-react";
import Image from "next/image";

const preferenceOptions = {
  languageComplexity: {
    Primary: "Simple words, short sentences, minimal jargon",
    "High School":
      "Moderate vocabulary, compound sentences, some subject-specific terms",
    University: "Academic language, subject-specific terminology",
  },
  analogyUsage: {
    Frequent:
      "Concepts are often explained using relatable analogies or metaphors to aid understanding.",
    Occasional: "Analogies are used sparingly to enhance understanding.",
    Limited:
      "Direct and literal, focusing on definitions and formal logic rather than metaphor.",
  },
  wordLength: {
    Short:
      "Single-syllable or short words and brief sentences; prioritizes clarity and readability.",
    Medium:
      "Mix of common and moderately long words; sentences are concise but allow for depth.",
    Long: "Subject-specific vocabulary; appropriate for advanced comprehension and precise meaning.",
  },
};

const previewQuestions = {
  Primary: {
    true: {
      Short:
        "How is a plant making food like a tiny chef using sunshine as an ingredient?",
      Medium:
        "Can you explain how plants eat sunlight? Is it like a person eating food?",
      Long: "Tell me about how plants make their food from light, maybe using a story about a little solar-powered factory.",
    },
    false: {
      Short: "How do plants eat sun?",
      Medium: "What do plants do to make food from sunlight?",
      Long: "Can you tell me in simple words how plants create their own food using the sun?",
    },
  },
  "High School": {
    true: {
      Short: "Explain photosynthesis with an analogy.",
      Medium:
        "How is photosynthesis like a solar panel charging a battery for the plant?",
      Long: "Describe the process of photosynthesis using an analogy of a factory that converts raw materials into finished products.",
    },
    false: {
      Short: "What is photosynthesis?",
      Medium: "How do plants convert sunlight into chemical energy?",
      Long: "Explain the key stages of photosynthesis, including the inputs and outputs of the process.",
    },
  },
  University: {
    true: {
      Short: "Explain photosynthesis metaphorically.",
      Medium:
        "How can the process of photosynthesis be analogized to a self-sustaining biochemical engine powered by solar energy?",
      Long: "Provide a sophisticated analogy to illustrate the intricate molecular machinery and energy conversion pathways involved in photosynthesis.",
    },
    false: {
      Short: "Define photosynthesis.",
      Medium:
        "Explain the biochemical process of photosynthesis, detailing the light-dependent and light-independent reactions.",
      Long: "Elaborate on the complete photosynthetic apparatus, from photon absorption by chlorophyll to the synthesis of glucose in the Calvin cycle.",
    },
  },
};

const getPreviewQuestion = (preferences) => {
  const { languageComplexity, analogyUsage, wordLength } = preferences;
  const useAnalogy =
    analogyUsage === "Frequent" || analogyUsage === "Occasional";
  return previewQuestions[languageComplexity][useAnalogy][wordLength];
};

export function Preferences() {
  const dbPreferences = useQuery(api.users.getPreferences);
  const savePreferences = useMutation(api.users.savePreferences);

  const [selectedPreferences, setSelectedPreferences] = useState({
    languageComplexity: "High School",
    analogyUsage: "Occasional",
    wordLength: "Medium",
  });
  const [initialPreferences, setInitialPreferences] =
    useState(selectedPreferences);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [previewQuestion, setPreviewQuestion] = useState(
    getPreviewQuestion(selectedPreferences),
  );

  useEffect(() => {
    if (dbPreferences) {
      const prefs = {
        languageComplexity: dbPreferences.languageComplexity ?? "High School",
        analogyUsage: dbPreferences.analogyUsage ?? "Occasional",
        wordLength: dbPreferences.wordLength ?? "Medium",
      };
      setSelectedPreferences(prefs);
      setInitialPreferences(prefs);
      setPreviewQuestion(getPreviewQuestion(prefs));
    }
  }, [dbPreferences]);

  const handleOptionClick = (key, value) => {
    setSelectedPreferences((prev) => {
      const newPrefs = { ...prev, [key]: value };
      setPreviewQuestion(getPreviewQuestion(newPrefs));
      return newPrefs;
    });
  };

  const handleSaveChanges = async () => {
    setIsSaving(true);
    try {
      await savePreferences({ preferences: selectedPreferences });
      setInitialPreferences(selectedPreferences); // update initial state
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
      }, 2000); // Hide success message after 2 seconds
    } catch (error) {
      console.error("Failed to save preferences:", error);
      // Optionally, show an error state to the user
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges =
    JSON.stringify(selectedPreferences) !== JSON.stringify(initialPreferences);

  return (
    <>
      <div className="flex flex-col gap-4 font-[Menco] ">
        <div className="flex flex-row gap-4 items-center">
          <div className="size-17 aspect-square">
            <Image
              src="/Tutors/steve.png"
              className="h-full w-full object-cover"
              alt=""
              width={68}
              height={68}
            />
          </div>
          {/* Preview Question */}
          <div className="text-xl font-bold text-black bg-white rounded-t-[24px] rounded-br-[24px] w-full p-4 h-[68px] flex items-center">
            (Preview) {previewQuestion}
          </div>
        </div>
        {Object.entries(preferenceOptions).map(([key, options]) => (
          <div key={key} className="flex flex-col gap-1 p-2 rounded-md">
            <div className="text-base w-full text-center text-white">
              {key
                .replace(/([A-Z])/g, " $1")
                .replace(/^./, (str) => str.toUpperCase())}
            </div>
            <div className="flex flex-row gap-4">
              {Object.entries(options).map(([option, description]) => (
                <button
                  key={option}
                  onClick={() => handleOptionClick(key, option)}
                  className={`flex flex-col gap-1 w-full rounded-md p-4 items-start justify-start text-left ${
                    selectedPreferences[key] === option
                      ? "bg-blue-200 outline-blue-300 outline-2"
                      : "bg-gray-100"
                  }`}
                >
                  <div className="text-base font-bold flex flex-row gap-1 items-center">
                    <div className="">{option}</div>
                    {selectedPreferences[key] === option && (
                      <Check className="size-3" />
                    )}
                  </div>
                  <div className="text-sm">{description}</div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-row gap-4 items-center justify-center mt-4">
        <button
          onClick={handleSaveChanges}
          disabled={isSaving || showSuccess}
          className="font-[Menco] text-lg font-bold bg-green-500 text-black rounded-md px-4 py-2 hover:cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 w-[200px]"
        >
          {showSuccess ? (
            <>
              Changes Saved <Check className="size-5" />
            </>
          ) : isSaving ? (
            "Saving..."
          ) : (
            "Save Changes"
          )}
        </button>
        {/* <DialogClose asChild>
            <div className="font-[Menco] text-lg font-bold bg-red-500 text-white rounded-md px-4 py-2 hover:cursor-pointer">
              Close
            </div>
          </DialogClose> */}
      </div>
    </>
  );
}
