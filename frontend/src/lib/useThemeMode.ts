import { useEffect, useState } from "react";

export function useIsDarkTheme(): boolean {
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof document === "undefined") return true;
    return (
      document.documentElement.classList.contains("dark") ||
      document.documentElement.dataset.theme !== "light"
    );
  });

  useEffect(() => {
    if (typeof document === "undefined") return;

    const checkDark = () => {
      const dark =
        document.documentElement.classList.contains("dark") ||
        document.documentElement.dataset.theme !== "light";
      setIsDark(dark);
    };

    checkDark();

    const observer = new MutationObserver(checkDark);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });

    return () => observer.disconnect();
  }, []);

  return isDark;
}
