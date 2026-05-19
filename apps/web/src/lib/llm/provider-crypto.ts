import crypto from "node:crypto";

export interface EncryptedApiKey {
  apiKeyEncrypted: string;
  apiKeyIv: string;
  apiKeyTag: string;
  apiKeyHint: string;
}

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;

function getLlmSettingsSecret(): string {
  const secret = process.env.LLM_SETTINGS_SECRET?.trim();
  if (!secret) {
    throw new Error("LLM_SETTINGS_SECRET이 설정되어 있지 않습니다.");
  }
  return secret;
}

export function assertLlmSettingsSecretAvailable(): void {
  // 저장 API는 새 키 입력 여부와 관계없이 마스터키 존재를 먼저 확인한다.
  getLlmSettingsSecret();
}

function deriveEncryptionKey(): Buffer {
  // 사용자가 길이를 맞추지 않아도 AES-256-GCM에 필요한 32바이트 키로 안정적으로 변환한다.
  return crypto.createHash("sha256").update(getLlmSettingsSecret()).digest();
}

export function createApiKeyHint(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (trimmed.length <= 8) return "****";
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

export function encryptLlmApiKey(apiKey: string): EncryptedApiKey {
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, deriveEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(apiKey.trim(), "utf8"),
    cipher.final(),
  ]);

  return {
    apiKeyEncrypted: encrypted.toString("base64"),
    apiKeyIv: iv.toString("base64"),
    apiKeyTag: cipher.getAuthTag().toString("base64"),
    apiKeyHint: createApiKeyHint(apiKey),
  };
}

export function decryptLlmApiKey(input: {
  apiKeyEncrypted: string;
  apiKeyIv: string;
  apiKeyTag: string;
}): string {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    deriveEncryptionKey(),
    Buffer.from(input.apiKeyIv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(input.apiKeyTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(input.apiKeyEncrypted, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
