import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ProfileInfo = {
  name: string;
  email: string;
  phone: string;
  age: string;
  timezone: string;
};

export const TIMEZONE_OPTIONS = [
  ["UTC", "UTC"],
  ["Asia/Kolkata", "(UTC+05:30) Kolkata"],
  ["Asia/Dhaka", "(UTC+06) Dhaka"],
  ["Asia/Dubai", "(UTC+04) Dubai"],
  ["Asia/Karachi", "(UTC+05) Karachi"],
  ["Asia/Singapore", "(UTC+08) Singapore"],
  ["Asia/Tokyo", "(UTC+09) Tokyo"],
  ["Europe/London", "(UTC+00) London"],
  ["Europe/Berlin", "(UTC+01) Berlin"],
  ["America/New_York", "(UTC-05) New York"],
  ["America/Los_Angeles", "(UTC-08) Los Angeles"],
] as const;

export function normalizeTimezone(timezone: string | undefined | null): string {
  if (!timezone) return "UTC";
  return timezone === "Asia/Calcutta" ? "Asia/Kolkata" : timezone;
}

const defaultTimezone = () => normalizeTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
const emptyProfile = (): ProfileInfo => ({ name: "", email: "", phone: "", age: "", timezone: defaultTimezone() });

const ProfileContext = createContext<{
  profile: ProfileInfo;
  loading: boolean;
  saveProfile: (profile: ProfileInfo) => Promise<void>;
}>({ profile: emptyProfile(), loading: true, saveProfile: async () => undefined });

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<ProfileInfo>(emptyProfile);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/profile")
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("profile unavailable")))
      .then((value: Partial<ProfileInfo>) => setProfile({ ...emptyProfile(), ...value, timezone: normalizeTimezone(value.timezone) }))
      .catch(() => setProfile(emptyProfile()))
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo(() => ({
    profile,
    loading,
    saveProfile: async (next: ProfileInfo) => {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!response.ok) throw new Error("profile save failed");
      const saved = await response.json() as ProfileInfo;
      setProfile({ ...saved, timezone: normalizeTimezone(saved.timezone) });
    },
  }), [loading, profile]);

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  return useContext(ProfileContext);
}

export function formatDateTime(value: string | number | Date | null | undefined, timezone: string, options: Intl.DateTimeFormatOptions = {}) {
  if (value === null || value === undefined || value === "") return "—";
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "medium", timeZone: timezone, ...options }).format(d);
  } catch {
    return "—";
  }
}

export function formatDate(value: string | number | Date | null | undefined, timezone: string) {
  if (value === null || value === undefined || value === "") return "—";
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(d);
  } catch {
    return "—";
  }
}

export function formatTime(value: string | number | Date | null | undefined, timezone: string) {
  if (value === null || value === undefined || value === "") return "—";
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(d);
  } catch {
    return "—";
  }
}

export function formatChartTime(value: number | null | undefined, timezone: string) {
  if (value === null || value === undefined || isNaN(value)) return "—";
  try {
    const d = new Date(value * 1000);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleTimeString("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return "—";
  }
}

export function timezoneSummary(timezone: string): { label: string; offset: string; detail: string } {
  const canonical = normalizeTimezone(timezone);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: canonical, timeZoneName: "longOffset" }).formatToParts(new Date());
  const rawOffset = parts.find((part) => part.type === "timeZoneName")?.value.replace("GMT", "UTC") || "UTC+00:00";
  const offset = rawOffset === "UTC" ? "UTC+00:00" : rawOffset.replace(/^UTC([+-])(\d)(?::(\d\d))?$/, (_match, sign, hour, minutes = "00") => `UTC${sign}0${hour}:${minutes}`);
  const match = offset.match(/^UTC([+-])(\d\d):(\d\d)$/);
  if (!match || match[1] === "+" && match[2] === "00" && match[3] === "00") {
    return { label: canonical, offset, detail: "Same as Coordinated Universal Time" };
  }
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  const amount = `${hours} hour${hours === 1 ? "" : "s"}${minutes ? ` and ${minutes} minutes` : ""}`;
  return { label: canonical, offset, detail: `${amount} ${match[1] === "+" ? "ahead of" : "behind"} Coordinated Universal Time` };
}
