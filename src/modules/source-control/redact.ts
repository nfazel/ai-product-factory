const TOKEN_PATTERN = /ghp_[A-Za-z0-9]+|github_pat_[A-Za-z0-9_]+|gho_[A-Za-z0-9]+/g;

export function redactSecrets(value: string) {
  let text = value;
  for (const key of ["GITHUB_TOKEN", "GITHUB_APP_PRIVATE_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GOOGLE_GEMINI_API_KEY", "AI_CREDENTIAL_ENCRYPTION_KEY"]) {
    const secret = process.env[key];
    if (secret && secret.length > 3) text = text.split(secret).join("[redacted]");
  }
  return text.replace(TOKEN_PATTERN, "[redacted]");
}
