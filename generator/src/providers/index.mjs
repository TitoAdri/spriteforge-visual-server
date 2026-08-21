import { generateOpenAI, editOpenAI } from "./openai.mjs";
import { generateGemini, editGemini } from "./gemini.mjs";

export const providers = Object.freeze({
  openai: { generate: generateOpenAI, edit: editOpenAI },
  gemini: { generate: generateGemini, edit: editGemini },
});

export function getProvider(name) {
  const provider = providers[name];
  if (!provider) throw new Error(`Unsupported provider: ${name}`);
  return provider;
}
