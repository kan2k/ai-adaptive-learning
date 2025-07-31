"use client";

import "katex/dist/katex.min.css";
import { InlineMath, BlockMath } from "react-katex";

// Utility function to parse message content for bullet points and bold text
const parseMessageContent = (content) => {
  if (!content) return [];

  const lines = content.split("\n");
  const parsedLines = [];

  lines.forEach((line, index) => {
    // Check if line starts with bullet point (asterisk or dash)
    const bulletMatch = line.match(/^(\s*)[*\-]\s+(.+)$/);

    if (bulletMatch) {
      // Parse bullet point line
      const [, indent, text] = bulletMatch;
      const parsedText = parseTextContent(text);
      parsedLines.push({
        type: "bullet",
        indent: indent.length,
        content: parsedText,
      });
    } else if (line.trim() === "") {
      // Empty line
      parsedLines.push({
        type: "empty",
        content: "",
      });
    } else {
      // Regular text line
      const parsedText = parseTextContent(line);
      parsedLines.push({
        type: "text",
        content: parsedText,
      });
    }
  });

  return parsedLines;
};

// Utility function to parse text for bold text (**text**) and LaTeX formulas ($formula$ or $$formula$$)
const parseTextContent = (text) => {
  if (!text) return [];

  const parts = [];
  let currentIndex = 0;

  // More sophisticated parsing to avoid false matches
  while (currentIndex < text.length) {
    // Look for the next potential match
    let nextMatch = null;
    let matchType = null;
    let matchStart = -1;
    let matchEnd = -1;

    // Check for block math first ($$...$$)
    const blockMathStart = text.indexOf("$$", currentIndex);
    if (blockMathStart !== -1) {
      const blockMathEnd = text.indexOf("$$", blockMathStart + 2);
      if (blockMathEnd !== -1) {
        nextMatch = text.slice(blockMathStart, blockMathEnd + 2);
        matchType = "blockMath";
        matchStart = blockMathStart;
        matchEnd = blockMathEnd + 2;
      }
    }

    // Check for inline math ($...$) - but not if we already found block math
    if (matchStart === -1) {
      const inlineMathStart = text.indexOf("$", currentIndex);
      if (inlineMathStart !== -1) {
        // Make sure it's not part of a block math
        const nextDollar = text.indexOf("$", inlineMathStart + 1);
        if (nextDollar !== -1 && nextDollar !== inlineMathStart + 1) {
          // Check if there's another $ right after (block math)
          if (text[nextDollar + 1] !== "$") {
            nextMatch = text.slice(inlineMathStart, nextDollar + 1);
            matchType = "inlineMath";
            matchStart = inlineMathStart;
            matchEnd = nextDollar + 1;
          }
        }
      }
    }

    // Check for bold text (**...**) - but not if we already found math
    if (matchStart === -1) {
      const boldStart = text.indexOf("**", currentIndex);
      if (boldStart !== -1) {
        const boldEnd = text.indexOf("**", boldStart + 2);
        if (boldEnd !== -1) {
          nextMatch = text.slice(boldStart, boldEnd + 2);
          matchType = "bold";
          matchStart = boldStart;
          matchEnd = boldEnd + 2;
        }
      }
    }

    // If no match found, add remaining text and break
    if (matchStart === -1) {
      parts.push({
        type: "text",
        content: text.slice(currentIndex),
      });
      break;
    }

    // Add text before the match
    if (matchStart > currentIndex) {
      parts.push({
        type: "text",
        content: text.slice(currentIndex, matchStart),
      });
    }

    // Add the match
    if (matchType === "blockMath") {
      parts.push({
        type: "blockMath",
        content: nextMatch.slice(2, -2), // Remove $$ wrapper
      });
    } else if (matchType === "inlineMath") {
      parts.push({
        type: "inlineMath",
        content: nextMatch.slice(1, -1), // Remove $ wrapper
      });
    } else if (matchType === "bold") {
      parts.push({
        type: "bold",
        content: nextMatch.slice(2, -2), // Remove ** wrapper
      });
    }

    currentIndex = matchEnd;
  }

  return parts;
};

export const LLMContent = ({ content }) => {
  const parsedLines = parseMessageContent(content);

  return (
    <div className="text-base font-bold whitespace-pre-wrap font-[Menco]">
      {parsedLines.map((line, lineIndex) => {
        if (line.type === "empty") {
          return <div key={lineIndex}>&nbsp;</div>;
        }

        if (line.type === "bullet") {
          return (
            <div key={lineIndex} className="flex items-start gap-2 my-1">
              <span className="flex-shrink-0">•</span>
              <div className="flex-1">
                {line.content.map((part, partIndex) => (
                  <span key={partIndex}>
                    {part.type === "bold" ? (
                      <strong className="font-bolder text-[17px]">
                        {part.content}
                      </strong>
                    ) : part.type === "inlineMath" ? (
                      <span className="inline-block">
                        <InlineMath math={part.content} />
                      </span>
                    ) : part.type === "blockMath" ? (
                      <div className="my-2 flex justify-center">
                        <BlockMath math={part.content} />
                      </div>
                    ) : (
                      part.content
                    )}
                  </span>
                ))}
              </div>
            </div>
          );
        }

        return (
          <div key={lineIndex}>
            {line.content.map((part, partIndex) => (
              <span key={partIndex}>
                {part.type === "bold" ? (
                  <strong className="font-bold">{part.content}</strong>
                ) : part.type === "inlineMath" ? (
                  <span className="inline-block">
                    <InlineMath math={part.content} />
                  </span>
                ) : part.type === "blockMath" ? (
                  <div className="my-2 flex justify-center">
                    <BlockMath math={part.content} />
                  </div>
                ) : (
                  part.content
                )}
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
};
