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

When no row exists, `AI_PROVIDER` and `AI_MODEL` are the bootstrap. A saved row wins over those variables. Changing the active provider does not rewrite historical `AgentRun` rows. Each run keeps the provider and model that performed the work.

| Variable | Purpose |
| --- | --- |
| `AI_PROVIDER` | `GOOGLE_GEMINI`, `OLLAMA`, or `OPENAI`. Aliases: `GEMINI`, `GOOGLE`. |
| `AI_MODEL` | Model identifier for that provider. Required. No model is substituted. |
| `GOOGLE_GEMINI_API_KEY` | Server credential read only for Google Gemini. |
| `OPENAI_API_KEY` | Server credential read only for OpenAI. |
| `OLLAMA_BASE_URL` | Server address for Ollama. Defaults to `http://127.0.0.1:11434`. |

Copy `.env.example` to `.env.local` or `.env`. Restart the server after a credential change. `.env`, `.env.local`, and `.env.*.local` are gitignored. `.env.example` is safe to commit and contains placeholders only.

`resolveModel(task)` returns the one active model for every task today. Discovery, requirements, definition, architecture, coding, verification, and insights already pass through `getAIProvider(task)`. A later change can give coding one model and verification another inside that function. Different models do not prove correctness. They can make the verification model independent of the coding model.

## Providers

Google Gemini is a cloud AI provider. It requires `GOOGLE_GEMINI_API_KEY`. Data is sent to the configured cloud AI provider. A current recommendation is `gemini-flash-latest`. That is a starting point, not a platform requirement. Pricing and free-tier status are outside this application and can change. Settings does not call a generation endpoint to decide that the key is present.

Ollama runs supported models locally. No API key is required for normal local use. Requests go to the configured endpoint. A loopback address is shown as a local endpoint. Settings may ask Ollama which models are installed. Only those names are offered. If Ollama is not running, Settings says so and does not invent a model list. AI Product Builder does not download or pull a model. Local performance depends on hardware, memory, model size, and context length. This application does not set a hardware minimum.

OpenAI is a cloud AI provider. It requires `OPENAI_API_KEY`. Data is sent to the configured cloud AI provider. A current recommendation is `gpt-4.1-mini`. That is a starting point, not a platform requirement. A ChatGPT subscription does not by itself provide the API credential. Settings does not call a generation endpoint to decide that the key is present.

A Gemini model is not sent to Ollama or OpenAI. An Ollama model is not sent to the others. An unknown provider fails.

## Secrets

Credentials stay in the server environment. They are not stored in `AiSelection`, `AgentRun`, activity, evidence, analytics, or error text. They are not sent to the browser and are not read from `NEXT_PUBLIC_` variables. Git and verification commands use an allowlist environment, so provider credentials are not copied into those child processes. The browser cannot set `OLLAMA_BASE_URL`, an API key, or any other environment variable on an AI request. Ollama is not a generic HTTP proxy. The adapter calls only `/api/tags` and `/api/chat` on the configured origin.

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

1. Obtain a Gemini API key from Google AI Studio or Google AI for Developers. Do not paste it into Settings or into a chat.
2. In the project directory, copy the example environment if you do not already have one: `cp .env.example .env.local`
3. Set `GOOGLE_GEMINI_API_KEY` to that key in `.env.local`. Leave the value out of git.
4. Restart AI Product Builder (`npm run dev`, port 4317).
5. Open Settings → AI Configuration.
6. Choose Google Gemini.
7. Enter a model identifier. `gemini-flash-latest` is a current recommendation, not a requirement.
8. Save. Status should read Configured. The key is not shown.
9. Open a product in Explore and run Discovery.

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

1. Obtain an OpenAI API key from the OpenAI platform. A ChatGPT subscription does not by itself provide this credential.
2. In the project directory, copy the example environment if you do not already have one: `cp .env.example .env.local`
3. Set `OPENAI_API_KEY` in `.env.local`. Leave the value out of git.
4. Restart AI Product Builder (`npm run dev`, port 4317).
5. Open Settings → AI Configuration.
6. Choose OpenAI.
7. Enter a model identifier. `gpt-4.1-mini` is a current recommendation, not a requirement.
8. Save. Status should read Configured. The key is not shown.
9. Open a product in Explore and run Discovery.
