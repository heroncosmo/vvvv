export const deliveryOrdersSoundStorageKey = "delivery-orders:sound-enabled";

let cachedNotificationAudioUrl: string | null = null;

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function buildNotificationAudioUrl() {
  const sampleRate = 22_050;
  const durationSeconds = 2.8;
  const totalSamples = Math.floor(sampleRate * durationSeconds);
  const notes = [
    { start: 0.0, end: 0.28, freq: 880, amp: 0.55 },
    { start: 0.18, end: 0.48, freq: 1318.5, amp: 0.4 },
    { start: 0.62, end: 0.95, freq: 987.8, amp: 0.48 },
    { start: 0.84, end: 1.18, freq: 1480, amp: 0.32 },
    { start: 1.45, end: 1.92, freq: 1046.5, amp: 0.42 },
    { start: 1.66, end: 2.2, freq: 1568, amp: 0.28 },
  ];

  const wavBuffer = new ArrayBuffer(44 + totalSamples * 2);
  const view = new DataView(wavBuffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + totalSamples * 2, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, totalSamples * 2, true);

  for (let sampleIndex = 0; sampleIndex < totalSamples; sampleIndex += 1) {
    const time = sampleIndex / sampleRate;
    let sample = 0;

    for (const note of notes) {
      if (time < note.start || time > note.end) continue;
      const relativeProgress = (time - note.start) / (note.end - note.start);
      const envelope = (1 - relativeProgress) ** 2;
      sample += note.amp * envelope * Math.sin(2 * Math.PI * note.freq * time);
      sample += note.amp * 0.18 * envelope * Math.sin(2 * Math.PI * note.freq * 2 * time);
    }

    sample += 0.01 * Math.sin(2 * Math.PI * 220 * time) * Math.max(0, 1 - time / durationSeconds);
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + sampleIndex * 2, Math.floor(clamped * 32767), true);
  }

  return URL.createObjectURL(new Blob([wavBuffer], { type: "audio/wav" }));
}

export function getDeliveryNotificationAudioUrl() {
  if (!cachedNotificationAudioUrl) {
    cachedNotificationAudioUrl = buildNotificationAudioUrl();
  }

  return cachedNotificationAudioUrl;
}

export function createDeliveryNotificationAudio() {
  const audio = new Audio(getDeliveryNotificationAudioUrl());
  audio.preload = "auto";
  audio.volume = 0.78;
  return audio;
}
