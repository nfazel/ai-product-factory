# AI providers

AI Product Builder talks to a model through `AIProvider`. Product Discovery, requirements analysis, product definition, architecture, engineering governance, coding, verification, release drafting, review classification, and metric explanations call `getAIProvider()`. They do not branch on Google Gemini, Ollama, or OpenAI.

```
AI Product Builder capability
        ↓
AIProvider
        ↓
AIProviderRegistry
        ↓
Configured provider
        ↓
Configured model
```

The active choice is one provider and one model. The model does not choose either. A failed provider is not replaced with another provider or another model.

Anthropic, Azure OpenAI, and AWS Bedrock are not implemented. A later provider is a new adapter and one branch in `src/modules/ai/registry.ts`.

## Contract

`generate` accepts a system prompt, messages, a Zod response schema, a schema name, and an optional temperature. The adapter may use the provider's structured-output feature. The application then validates the same Zod schema. A successful HTTP response is not accepted until that validation passes. Missing business fields are not invented.

The result records the provider, the model, token usage when the provider actually returned it, a finish status when one exists, and the request duration. Usage stays null when the provider does not report it. It is not estimated.

## Configuration

Settings stores the provider and model in `AiSelection`. That row has no credential. `AiSelectionChange` records:

- AI provider changed from X to Y
- AI model changed from X to Y
- Google Gemini API key saved, replaced, or removed
- OpenAI API key saved, replaced, or removed

Those history lines name the action. They do not contain the key.

When no row exists, `AI_PROVIDER` and `AI_MODEL` are the bootstrap. A saved row wins over those variables. Changing the active provider does not rewrite historical `AgentRun` rows. Each run keeps the provider and model that performed the work. Saving a key does not change the selected provider or model.

| Variable | Purpose |
| --- | --- |
| `AI_PROVIDER` | `GOOGLE_GEMINI`, `OLLAMA`, or `OPENAI`. Aliases: `GEMINI`, `GOOGLE`. |
| `AI_MODEL` | Model identifier for that provider. Required. No model is substituted. |
| `AI_CREDENTIAL_ENCRYPTION_KEY` | 32-byte key, base64 (`openssl rand -base64 32`) or 64 hex characters (`openssl rand -hex 32`). Encrypts API keys saved in Settings. It is not stored in the database. |
| `GOOGLE_GEMINI_API_KEY` | Optional server credential for Google Gemini, used when Settings has no saved key. |
| `OPENAI_API_KEY` | Optional server credential for OpenAI, used when Settings has no saved key. |
| `OLLAMA_BASE_URL` | Server address for Ollama. Defaults to `http://127.0.0.1:11434`. |

Copy `.env.example` to `.env.local` or `.env`. Restart the server after changing `AI_CREDENTIAL_ENCRYPTION_KEY` or an environment credential. `.env`, `.env.local`, and `.env.*.local` are gitignored. `.env.example` is safe to commit and contains placeholders only.

### Credentials

For the provider that is already selected:

1. Application configuration. The key saved in Settings, decrypted only on the server.
2. Server environment. `GOOGLE_GEMINI_API_KEY` or `OPENAI_API_KEY`.
3. Not configured.

An application credential wins over the environment variable for that same provider. Removing the application key makes the environment variable active again. Removal does not edit environment variables. A credential that cannot be decrypted does not fall back to the environment variable. Save the key again after checking `AI_CREDENTIAL_ENCRYPTION_KEY`.

Ollama does not use an API key for normal local use. Settings shows the endpoint, the model, and availability.

There is one credential row per cloud provider in `AiProviderCredential`: provider, ciphertext, initialisation vector, and authentication tag. The plaintext is not stored. The cipher is AES-256-GCM from Node.js `crypto`.

Settings shows the credential source as Application configuration, Server environment, or Not configured. It never shows the key, a prefix, a suffix, or a mask computed from the key. A row of dots on the page is static text.

Configured means a credential is present. Connection tested successfully means Test Connection succeeded for the current provider and model. Saving a key clears that result. Opening Settings does not call the model.

Test Connection is a separate action. It looks up the saved model with the saved credential. It does not generate text. The page says Connection successful, or Authentication failed, Model unavailable, Provider unavailable, or Rate limited.

Replace stores a new ciphertext for that provider and drops the previous one. The old key is not shown.

`resolveModel(task)` returns the one active model for every task today. Discovery, requirements, definition, architecture, coding, verification, and insights already pass through `getAIProvider(task)`. A later change can give coding one model and verification another inside that function. Different models do not prove correctness. They can make the verification model independent of the coding model.

## Providers

Google Gemini is a cloud AI provider. It needs a Gemini API key, either saved in Settings or set as `GOOGLE_GEMINI_API_KEY`. Data is sent to the configured cloud AI provider. A current recommendation is `gemini-flash-latest`. That is a starting point, not a platform requirement. Pricing and free-tier status are outside this application and can change. Opening Settings does not call Gemini.

Ollama runs supported models locally. No API key is required for normal local use. Requests go to the configured endpoint. A loopback address is shown as a local endpoint. Settings may ask Ollama which models are installed. Only those names are offered. If Ollama is not running, Settings says so and does not invent a model list. AI Product Builder does not download or pull a model. Local performance depends on hardware, memory, model size, and context length. This application does not set a hardware minimum.

OpenAI is a cloud AI provider. It needs an OpenAI API key, either saved in Settings or set as `OPENAI_API_KEY`. Data is sent to the configured cloud AI provider. A current recommendation is `gpt-4.1-mini`. That is a starting point, not a platform requirement. A ChatGPT subscription does not by itself provide the API credential. Opening Settings does not call OpenAI.

A Gemini model is not sent to Ollama or OpenAI. An Ollama model is not sent to the others. An unknown provider fails.

## Secrets

Provider API keys are either encrypted in `AiProviderCredential` or left in the server environment. They are not stored in `AiSelection`, `AgentRun`, activity, evidence, analytics, or error text. They are not sent to the browser and are not read from `NEXT_PUBLIC_` variables. No Settings response returns a decrypted key. Git and verification commands use an allowlist environment, so provider credentials and `AI_CREDENTIAL_ENCRYPTION_KEY` are not copied into those child processes. The browser cannot set `OLLAMA_BASE_URL`, an API key, or any other environment variable on an AI request. Ollama is not a generic HTTP proxy. The adapter calls only `/api/tags` and `/api/chat` on the configured origin.

## Failure

Runs fail closed. Categories include `NOT_CONFIGURED`, `MODEL_NOT_CONFIGURED`, `MODEL_NOT_AVAILABLE`, `AUTHENTICATION_FAILED`, `RATE_LIMITED`, `PROVIDER_UNAVAILABLE`, `TIMEOUT`, `INVALID_RESPONSE`, and `SCHEMA_VALIDATION_FAILED`. The page shows a short message. Provider detail in server logs is redacted.

Discovery and requirements analysis say that AI is not configured and link to Settings with Configure AI. If Ollama is selected and not running, the page says local AI is unavailable.

## Evidence and analytics

`AgentRun` output stores provider, model, purpose, usage when present, and an error category when the failure is an `AIFailure`. Status, start, completion, and duration stay on the run columns. Evidence on the product overview and on a work item shows provider, model, status, duration, and usage or "Usage unavailable".

Token metrics can be grouped by the provider and model stored on the run. Cost stays unavailable unless a run already stored `estimatedCost`. Prices are not looked up from a table.

Release drafting, release review narrative, pull-request title and comment classification, and Factory Insights use `AIProvider` and Zod. They do not create an `AgentRun`. Planning and Review are not implemented.

## Tests

Automated tests use `setAIProviderForTests` or a provider test hook. They do not call Gemini, Ollama, or OpenAI over the network.

## QUICK START — GEMINI

1. Obtain a Gemini API key from Google AI Studio or Google AI for Developers. Do not paste it into a chat or commit it.
2. In the project directory, copy the example environment if you do not already have one: `cp .env.example .env.local`
3. Generate an encryption key and set `AI_CREDENTIAL_ENCRYPTION_KEY` in `.env.local`. Use `openssl rand -base64 32`. Leave the value out of git. This is the only secret you need to set outside the application.
4. Restart AI Product Builder (`npm run dev`, port 4317).
5. Open Settings → AI Configuration.
6. Choose Google Gemini.
7. Enter a model identifier. `gemini-flash-latest` is a current recommendation, not a requirement.
8. Save the provider and model.
9. Enter the Gemini API key and choose Save API Key. The page then says the key is configured and does not show it.
10. Choose Test Connection. Saving the key does not do this for you.
11. Open a product in Explore and run Discovery.

To keep using an environment variable instead, set `GOOGLE_GEMINI_API_KEY` and skip steps 9 and 10. Do not put that key in `NEXT_PUBLIC_` variables.

## QUICK START — OLLAMA

1. Install Ollama from the Ollama site. AI Product Builder does not install it.
2. Start Ollama so it listens on your machine. The default address is `http://127.0.0.1:11434`.
3. Install a model yourself, for example `ollama pull llama3.2`. Pick a size your machine can run. AI Product Builder does not run that command.
4. Optional: set `OLLAMA_BASE_URL` in `.env.local` if Ollama is not on the default address, then restart the server. Do not point this at an untrusted host.
5. Open Settings → AI Configuration.
6. Choose Ollama. Installed models are listed when Ollama is running. If it is not running, Settings says Ollama is not running.
7. Select the installed model and save.
8. Open a product in Explore and run Discovery. Prompts go to that local endpoint.

## QUICK START — OPENAI

1. Obtain an OpenAI API key from the OpenAI platform. A ChatGPT subscription does not by itself provide this credential. Do not paste it into a chat or commit it.
2. In the project directory, copy the example environment if you do not already have one: `cp .env.example .env.local`
3. Set `AI_CREDENTIAL_ENCRYPTION_KEY` if you have not already. Use `openssl rand -base64 32`. Restart after adding it.
4. Open Settings → AI Configuration.
5. Choose OpenAI.
6. Enter a model identifier. `gpt-4.1-mini` is a current recommendation, not a requirement.
7. Save the provider and model.
8. Enter the OpenAI API key and choose Save API Key.
9. Choose Test Connection when you want to check it.
10. Open a product in Explore and run Discovery.

To keep using an environment variable instead, set `OPENAI_API_KEY` and skip the key field. Do not put that key in `NEXT_PUBLIC_` variables.
