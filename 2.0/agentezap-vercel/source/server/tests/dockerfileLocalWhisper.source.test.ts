import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Dockerfile.vps ships local Whisper runtime for production audio transcription", () => {
  const dockerfile = readFileSync("Dockerfile.vps", "utf8");

  assert.match(dockerfile, /FROM node:20-bookworm-slim AS whisper/);
  assert.match(dockerfile, /https:\/\/github\.com\/ggml-org\/whisper\.cpp/);
  assert.match(dockerfile, /--target whisper-cli/);
  assert.match(dockerfile, /\/opt\/agentezap\/whisper\/whisper-cli/);
  assert.match(dockerfile, /cp \/tmp\/whisper\.cpp\/build\/bin\/\*\.so\* \/opt\/agentezap\/whisper\//);
  assert.match(dockerfile, /ggml-\$\{LOCAL_WHISPER_MODEL\}\.bin/);
  assert.match(dockerfile, /ENV LOCAL_WHISPER_TRANSCRIPTION_ENABLED=true/);
  assert.match(dockerfile, /ENV LOCAL_WHISPER_MODEL=base/);
  assert.match(dockerfile, /ENV LOCAL_WHISPER_LANGUAGE=pt/);
  assert.match(dockerfile, /ENV LOCAL_WHISPER_TIMEOUT_MS=180000/);
  assert.match(dockerfile, /ENV AUDIO_TRANSCRIPTION_PRIMARY_PROVIDER=deepinfra/);
  assert.match(dockerfile, /ENV AUDIO_TRANSCRIPTION_DEEPINFRA_TIMEOUT_MS=30000/);
  assert.match(dockerfile, /ENV AUDIO_TRANSCRIPTION_NORMALIZE_ENABLED=true/);
  assert.match(dockerfile, /ENV AUDIO_TRANSCRIPTION_NORMALIZE_MAX_BYTES=26214400/);
  assert.match(dockerfile, /ENV AUDIO_TRANSCRIPTION_NORMALIZE_TIMEOUT_MS=30000/);
  assert.match(dockerfile, /COPY --from=whisper \/opt\/agentezap\/whisper \/opt\/agentezap\/whisper/);
  assert.match(dockerfile, /ldconfig/);
  assert.match(dockerfile, /\/opt\/agentezap\/whisper\/whisper-cli --help/);
});
