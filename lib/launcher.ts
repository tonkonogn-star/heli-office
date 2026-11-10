import crypto from "node:crypto";
import { getSetting, setSetting } from "./db";

/* Подарочная ссылка Насти — только «установщик»: Максим нажимает кнопку, и приложение копируется в его собственные
   аккаунты (GitHub + Vercel + база Neon). Дальше оно живёт у него и от Насти не зависит. В копии Максима этого режима нет. */

export const SOURCE_REPO = "https://github.com/tonkonogn-star/heli-office";
const LAUNCHER_HOST = "heli-office.vercel.app";

export function isLauncher() {
  return process.env.LAUNCHER === "1" || process.env.VERCEL_PROJECT_PRODUCTION_URL === LAUNCHER_HOST;
}

export async function movedTo() {
  return (await getSetting<string>("moved_to").catch(() => null)) || null;
}

/** Ссылка «Установить»: копия кода в его GitHub, проект в его Vercel, бесплатная база Neon, секрет расписания — случайный. */
export function deployUrl(origin: string) {
  const suffix = crypto.randomBytes(2).toString("hex");
  const db = JSON.stringify([{ type: "integration", integrationSlug: "neon", productSlug: "neon", protocol: "storage" }]);
  const p = new URLSearchParams({
    "repository-url": SOURCE_REPO,
    "project-name": `office-maxim-${suffix}`,
    "repository-name": "office",
    env: "CRON_SECRET",
    envDefaults: JSON.stringify({ CRON_SECRET: crypto.randomBytes(24).toString("hex") }),
    envDescription: "Секрет для расписания (утренняя сводка, счета 1-го числа). Уже заполнен — ничего менять не нужно.",
    products: db,
    stores: db,
    "redirect-url": `${origin}/api/install/done`,
  });
  return "https://vercel.com/new/clone?" + p.toString();
}

/** Куда ведёт подарочная ссылка после установки. Задаётся один раз, чтобы чужой не мог подменить адрес. */
export async function rememberMove(url: string) {
  if (await movedTo()) return false;
  let u: URL;
  try {
    u = new URL(url.startsWith("http") ? url : "https://" + url);
  } catch {
    return false;
  }
  if (!u.hostname.endsWith(".vercel.app") || u.hostname === LAUNCHER_HOST) return false;
  await setSetting("moved_to", `https://${u.hostname}`);
  return true;
}
