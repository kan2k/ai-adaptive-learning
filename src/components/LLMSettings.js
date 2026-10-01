"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { Check } from "lucide-react";
import { fetcher, apiFetch } from "@/lib/api";

const inputClass =
  "w-full rounded-md p-3 bg-white text-black text-base font-[Menco] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-400";

export function LLMSettings() {
  const { data, mutate } = useSWR("/api/llm-config", fetcher);
  const [form, setForm] = useState({
    provider: "openrouter",
    apiKey: "",
    baseUrl: "",
    modelFast: "",
    modelSmart: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (data) {
      setForm({
        provider: data.provider || "openrouter",
        apiKey: "",
        baseUrl: data.baseUrl || "",
        modelFast: data.modelOverrides?.fast || "",
        modelSmart: data.modelOverrides?.smart || "",
      });
    }
  }, [data]);

  const providers = data?.providers || {};
  const preset = providers[form.provider] || {};
  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await apiFetch("/api/llm-config", {
        method: "PUT",
        body: {
          provider: form.provider,
          apiKey: form.apiKey,
          baseUrl: form.baseUrl,
          modelFast: form.modelFast,
          modelSmart: form.modelSmart,
        },
      });
      await mutate();
      setForm((f) => ({ ...f, apiKey: "" }));
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 font-[Menco]">
      <div className="flex flex-col gap-1 p-2 rounded-md">
        <div className="text-base text-white">Provider</div>
        <select value={form.provider} onChange={set("provider")} className={inputClass}>
          {Object.entries(providers).map(([id, p]) => (
            <option key={id} value={id}>
              {p.label}
            </option>
          ))}
        </select>
        {preset.keyUrl && (
          <a
            href={preset.keyUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-white underline underline-offset-2 mt-1"
          >
            Get a key from {preset.label} →
          </a>
        )}
      </div>

      {!preset.keyless && (
        <div className="flex flex-col gap-1 p-2 rounded-md">
          <div className="text-base text-white">API key</div>
          <input
            type="password"
            value={form.apiKey}
            onChange={set("apiKey")}
            placeholder={data?.hasKey ? `Saved (${data.keyHint}) — paste to replace` : "sk-..."}
            className={inputClass}
          />
        </div>
      )}

      {(form.provider === "custom" || form.provider === "ollama") && (
        <div className="flex flex-col gap-1 p-2 rounded-md">
          <div className="text-base text-white">Base URL</div>
          <input
            value={form.baseUrl}
            onChange={set("baseUrl")}
            placeholder="http://localhost:11434/v1"
            className={inputClass}
          />
        </div>
      )}

      <div className="flex flex-row gap-4">
        <div className="flex flex-col gap-1 p-2 rounded-md w-full">
          <div className="text-base text-white">Content model</div>
          <input
            value={form.modelFast}
            onChange={set("modelFast")}
            placeholder={preset.defaults?.fast || "provider default"}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1 p-2 rounded-md w-full">
          <div className="text-base text-white">Tutor model</div>
          <input
            value={form.modelSmart}
            onChange={set("modelSmart")}
            placeholder={preset.defaults?.smart || "provider default"}
            className={inputClass}
          />
        </div>
      </div>

      <div className="text-sm text-white/80 px-2">
        Your key is stored on this computer only. Typical cost with the
        defaults: about $1/month of daily studying.
      </div>

      <div className="flex flex-row gap-4 items-center justify-center mt-2">
        <button
          onClick={handleSave}
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
      </div>
    </div>
  );
}
