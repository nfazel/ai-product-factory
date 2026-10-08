# AI provider

AI Product Builder talks to a model through `AIProvider`. Product modules do not import a provider SDK and do not branch on OpenAI or Anthropic.

## Contract

```ts
generate({
  systemPrompt,
  messages,
  responseSchema,
  schemaName,
  temperature,
})
```

The result is `{ data, usage, model, provider }`. `usage` uses null when the provider does not report a token count. A successful HTTP call is not trusted: `requireStructured` runs the Zod schema again and throws if a field is missing or the shape is wrong. Missing fields are not invented.

## Registry

`createConfiguredProvider()` in `src/modules/ai/registry.ts` reads the server configuration and returns an `OpenAIProvider` or an `AnthropicProvider`. `getAIProvider(task?)` is what Discovery, requirements analysis, product definition, architecture, governance, coding, verification, release drafting, review classification, and metric explanations call.

A test may install a double with `setAIProviderForTests`. That double is the only override. There is no silent fallback to another provider or another model.

Google and Azure OpenAI are not registered. An unknown `AI_PROVIDER` fails before a request is sent.

## Configuration

| Variable | Purpose |
| --- | --- |
| `AI_PROVIDER` | `openai` or `anthropic`. Required. Empty does not default to OpenAI. |
| `AI_MODEL` | Model id for that provider. Required. Empty does not default to a built-in model. |
| `OPENAI_API_KEY` | Server credential read only when the provider is OpenAI. |
| `ANTHROPIC_API_KEY` | Server credential read only when the provider is Anthropic. |

The adapter checks that the model id is not an obvious id for the other provider, then sends that exact id. The provider API decides whether the id exists. A mismatch or an unknown id fails. Nothing is substituted.

`resolveModel(task?)` returns `AI_MODEL` for every task today. Discovery, requirements, definition, architecture, coding, verification, and insights can later read their own variables inside that function. Product modules already call `getAIProvider()` and do not select a model themselves. The application does not ask the model to choose a provider or a model.

## Credentials

Keys stay in the server environment. They are not `NEXT_PUBLIC_` variables, not returned by Settings, and not written to `AgentRun`, activity, evidence, or client configuration. `describeAIConfiguration()` returns the provider label, the model id, and Configured or Not configured. Settings can name the environment variable an administrator must set. It does not show a key, a fragment of a key, or its length.

Git commands and verification commands use an allowlist environment. `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` are not copied into that child process. Stored error text is passed through `safeErrorMessage`, which redacts both key families.

## Failures

These stop the operation and do not become a fake model response:

- provider not selected
- provider not supported
- model not selected
- model incompatible with the provider
- credential missing or rejected
- rate limit
- provider unavailable
- timeout
- structured output that fails Zod

The product message is safe to show. The server log receives the redacted provider message.

## Agent runs

Completed runs store `provider`, `model`, and `usage` on the `AgentRun` output when the runner already persisted a run. Failed runs store the same provider and model from configuration when they are known, plus the redacted error. Cost stays empty. Factory Insights explains metrics and does not create an `AgentRun`. Release drafting and pull-request text call the same provider and do not create an `AgentRun` either.

## Adding a provider

1. Add a server-only adapter that implements `AIProvider` and translates `generate` to that vendor's official API, including its structured-output mechanism.
2. Validate the response with `requireStructured`. Map transport failures through `mapProviderFailure`.
3. Register the id in `src/modules/ai/config.ts` and construct the adapter in `src/modules/ai/registry.ts`.
4. Read the credential from a server environment variable. Do not add a `NEXT_PUBLIC_` name.
5. Teach `safeErrorMessage` and `redactSecrets` the new secret shape.
6. Document the variable in `.env.example` and Settings setup copy.

Do not import the SDK from a product module.
