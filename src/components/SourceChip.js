export function SourceChip({ file, heading, className = "" }) {
  if (!file) return null;
  return (
    <div
      className={`text-xs bg-black/20 text-white rounded-full px-3 py-0.5 w-fit max-w-full truncate ${className}`}
    >
      from {file}
      {heading ? ` · ${heading}` : ""}
    </div>
  );
}
