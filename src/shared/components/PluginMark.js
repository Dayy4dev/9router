"use client";

// Monograms for the custom plugins and the native model capabilities.
//
// One mark per plugin, drawn as two letters rather than a pictogram, and every
// one of them the same colour. Seven pictograms in seven saturated hues read as
// seven unrelated brands; seven letters in one accent read as one system. The
// letters are what differentiates them - IV, TD, SM, JG, CS, OB, AS - so the
// shape language never has to carry meaning at 12px.
//
// The native caps get their own letters. Image Vision is "IV" and native vision
// cannot also be "IV" or the two blur together on a model row where both are
// possible; "EY" and "RN" keep them apart without a second colour.
//
// Colour is the caller's business, not this file's. The mark carries none of its
// own, so a plugin tile can be themed with the primary accent and a dense model
// row can stay muted, from the same component - no second set of marks.
//
// An unknown name renders nothing - never a ligature fallback.

const PLUGIN_MONOGRAMS = {
  imageVision: "IV",
  thinkDeeper: "TD",
  speedMode: "SM",
  jsonGuard: "JG",
  contextSqueezer: "CS",
  openaiToolBridge: "OB",
  antiSlop: "AS",
  vision: "EY",
  reasoning: "RN",
};

// Smallest legible letter run. Below this the two letters stop being readable as
// letters and turn into a smudge, so a 12px row gets 8px rather than 7px.
const MIN_FONT_PX = 8;

function PluginMark({ name, size = 20, className = "" }) {
  const monogram = PLUGIN_MONOGRAMS[name];
  if (!monogram) return null;
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 select-none items-center justify-center font-semibold leading-none tracking-[-0.04em] ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        fontSize: `${Math.max(MIN_FONT_PX, Math.round(size * 0.58))}px`,
      }}
    >
      {monogram}
    </span>
  );
}

export default PluginMark;