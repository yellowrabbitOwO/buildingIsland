import type { TranslationKey } from "../../i18n";

export type ScriptLineType =
  | "sceneHeading"
  | "action"
  | "character"
  | "dialogue"
  | "parenthetical"
  | "transition"
  | "centered";

export const SCRIPT_LINE_TYPE_LABELS: Record<ScriptLineType, TranslationKey> = {
  sceneHeading: "scriptLineType.sceneHeading",
  action: "scriptLineType.action",
  character: "scriptLineType.character",
  dialogue: "scriptLineType.dialogue",
  parenthetical: "scriptLineType.parenthetical",
  transition: "scriptLineType.transition",
  centered: "scriptLineType.centered",
};

export const SCRIPT_LINE_TYPES: ScriptLineType[] = [
  "sceneHeading",
  "action",
  "character",
  "dialogue",
  "parenthetical",
  "transition",
  "centered",
];
