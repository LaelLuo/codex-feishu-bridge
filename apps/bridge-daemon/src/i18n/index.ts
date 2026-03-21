import type { FeishuUiLanguage } from "@codex-feishu-bridge/shared";

import { EN_US_MESSAGES } from "./locales/en-US";
import { ZH_CN_MESSAGES } from "./locales/zh-CN";

export type FeishuMessageKey = keyof typeof EN_US_MESSAGES;
export type FeishuMessageParams = Record<string, string | number | boolean | undefined>;
export type FeishuTranslator = (key: FeishuMessageKey, params?: FeishuMessageParams) => string;

const MESSAGE_CATALOGS: Record<FeishuUiLanguage, Record<FeishuMessageKey, string>> = {
  "en-US": EN_US_MESSAGES,
  "zh-CN": ZH_CN_MESSAGES,
};

export function createFeishuTranslator(locale: FeishuUiLanguage): FeishuTranslator {
  const catalog = MESSAGE_CATALOGS[locale] ?? EN_US_MESSAGES;

  return (key, params = {}) => {
    const template = catalog[key] ?? EN_US_MESSAGES[key] ?? key;
    return template.replace(/\{(\w+)\}/g, (_match, placeholder: string) => {
      const value = params[placeholder];
      return value === undefined ? `{${placeholder}}` : String(value);
    });
  };
}
