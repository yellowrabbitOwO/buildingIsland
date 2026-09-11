import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import zhTW from "./locales/zh-TW";
import en from "./locales/en";
import type { BuiltInCategoryKey, Category } from "./data/types";

export type Language = "zh-TW" | "en";
export type TranslationKey = keyof typeof zhTW;

const STORAGE_KEY = "building-island-language";
const DICTS: Record<Language, Record<TranslationKey, string>> = { "zh-TW": zhTW, en };

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  /** 依目前語言查表；vars 提供時用 {{key}} 語法做簡單字串插值（例如帶入條目/世界名稱）。
   * 找不到對應語言的翻譯就退回繁體中文，兩邊都沒有才顯示 key 本身（開發期能立刻看出漏翻） */
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === "en" ? "en" : "zh-TW";
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, language);
  }, [language]);

  const t: LanguageContextValue["t"] = (key, vars) => {
    let text = DICTS[language][key] ?? DICTS["zh-TW"][key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        text = text.replace(new RegExp(`{{${k}}}`, "g"), String(v));
      }
    }
    return text;
  };

  return <LanguageContext.Provider value={{ language, setLanguage, t }}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage 必須在 LanguageProvider 內使用");
  return ctx;
}

const BUILTIN_CATEGORY_TRANSLATION_KEYS: Record<BuiltInCategoryKey, TranslationKey> = {
  character: "builtInCategory.character",
  location: "builtInCategory.location",
  event: "builtInCategory.event",
  organization: "builtInCategory.organization",
  item: "builtInCategory.item",
  note: "builtInCategory.note",
};

/** 內建分類（見 seed.ts／BUILTIN_CATEGORY_LABELS）的 name 欄位是種進資料庫的固定中文字面值——
 * 使用者不能改名，所以有 builtInKey 時一律改用依語言查表的翻譯文字；自訂分類沒有 builtInKey，
 * 照樣顯示使用者自己取的 name */
export function categoryDisplayName(category: Pick<Category, "name" | "builtInKey">, t: LanguageContextValue["t"]): string {
  return category.builtInKey ? t(BUILTIN_CATEGORY_TRANSLATION_KEYS[category.builtInKey]) : category.name;
}
