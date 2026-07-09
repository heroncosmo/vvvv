import test from "node:test";
import assert from "node:assert/strict";

import {
  checkFFmpegAvailable,
  convertBufferToWhatsAppAudio,
  convertToWhatsAppAudio,
} from "../audioConverter";

function createTestWavBuffer(durationSeconds = 1, frequency = 440): Buffer {
  const sampleRate = 16000;
  const numSamples = sampleRate * durationSeconds;
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * frequency * t) * 0.2;
    buffer.writeInt16LE(sample * 32767, 44 + i * 2);
  }

  return buffer;
}

test("convertBufferToWhatsAppAudio converte WAV para OGG/Opus compativel com PTT", async (t) => {
  if (!(await checkFFmpegAvailable())) {
    t.skip("FFmpeg indisponivel no ambiente de teste");
    return;
  }

  const wavBuffer = createTestWavBuffer();
  const converted = await convertBufferToWhatsAppAudio(wavBuffer, "audio/wav");

  assert.equal(converted.mimeType, "audio/ogg; codecs=opus");
  assert.equal(converted.extension, "ogg");
  assert.equal(converted.buffer.subarray(0, 4).toString(), "OggS");
  assert.ok(converted.buffer.length > 0);
});

test("convertBufferToWhatsAppAudio faz fallback seguro quando FFmpeg nao esta disponivel", async (t) => {
  if (await checkFFmpegAvailable()) {
    t.skip("FFmpeg disponivel; fallback nao deve ser exercitado neste ambiente");
    return;
  }

  const wavBuffer = createTestWavBuffer();
  const converted = await convertBufferToWhatsAppAudio(wavBuffer, "audio/wav");

  assert.equal(converted.mimeType, "audio/wav");
  assert.equal(converted.extension, "wav");
  assert.equal(converted.converted, false);
  assert.deepEqual(converted.buffer, wavBuffer);
});

test("convertBufferToWhatsAppAudio preserva OGG ja valido", async () => {
  const oggLikeBuffer = Buffer.concat([
    Buffer.from("OggS", "utf8"),
    Buffer.from([0x00, 0x02, 0x00, 0x00]),
  ]);

  const converted = await convertBufferToWhatsAppAudio(
    oggLikeBuffer,
    "audio/ogg; codecs=opus",
  );

  assert.equal(converted.mimeType, "audio/ogg; codecs=opus");
  assert.equal(converted.extension, "ogg");
  assert.equal(converted.converted, false);
  assert.deepEqual(converted.buffer, oggLikeBuffer);
});

test("convertToWhatsAppAudio aceita Data URL e retorna OGG/Opus", async (t) => {
  if (!(await checkFFmpegAvailable())) {
    t.skip("FFmpeg indisponivel no ambiente de teste");
    return;
  }

  const wavBuffer = createTestWavBuffer();
  const dataUrl = `data:audio/wav;base64,${wavBuffer.toString("base64")}`;
  const converted = await convertToWhatsAppAudio(dataUrl, "audio/wav");
  const convertedBuffer = Buffer.from(converted.data, "base64");

  assert.equal(converted.mimeType, "audio/ogg; codecs=opus");
  assert.equal(convertedBuffer.subarray(0, 4).toString(), "OggS");
});
