import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../theme";
import { useLanguage, type Language } from "../i18n";
import CurrentUserSection from "../components/localUser/CurrentUserSection";
import { getLocalStorageUsage, formatBytes, type StorageUsage } from "../data/storageUsage";

/** 帳號層級的使用者設定頁（規格文件「六、使用者設定」），從世界列表頁標頭的「使用者設定」按鈕
 * 進來，不綁定任何特定世界。世界相關的「匯出資料」功能仍留在各世界內的設定頁
 * （pages/UserSettingsPage.tsx，側邊欄「使用者」連結）——那邊的匯出範圍（整個世界／特定分類／
 * 特定條目）本來就需要世界情境，不適合搬到這個帳號層級頁面 */
export default function AccountSettingsPage() {
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const navigate = useNavigate();
  const [usage, setUsage] = useState<StorageUsage | undefined>(undefined);

  useEffect(() => {
    getLocalStorageUsage().then(setUsage);
  }, []);

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "32px 24px" }}>
      <button className="btn-ghost" style={{ padding: 0, marginBottom: 16 }} onClick={() => navigate("/")}>
        {t("accountSettings.backToWorldList")}
      </button>
      <h1 style={{ marginBottom: 24 }}>{t("accountSettings.heading")}</h1>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <CurrentUserSection />

        <div>
          <h3 style={{ marginBottom: 8 }}>{t("accountSettings.displayMode")}</h3>
          <button className="btn" onClick={toggleTheme}>
            {theme === "dark" ? t("accountSettings.darkMode") : t("accountSettings.lightMode")}
          </button>
        </div>

        <div>
          <h3 style={{ marginBottom: 8 }}>{t("accountSettings.language")}</h3>
          <select value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
            <option value="zh-TW">繁體中文</option>
            <option value="en">English</option>
          </select>
        </div>

        <div>
          <h3 style={{ marginBottom: 8 }}>{t("accountSettings.storageUsage")}</h3>
          <p style={{ color: "var(--text-muted)", margin: 0 }}>
            {t("accountSettings.storageLocal", {
              value: usage ? formatBytes(usage.usageBytes) : t("accountSettings.storageUnavailable"),
            })}
            {usage?.quotaBytes ? t("accountSettings.storageQuota", { quota: formatBytes(usage.quotaBytes) }) : ""}
          </p>
          <p style={{ color: "var(--text-faint)", fontSize: 13, margin: "4px 0 0" }}>{t("accountSettings.cloudStorage")}</p>
        </div>
      </div>
    </div>
  );
}
