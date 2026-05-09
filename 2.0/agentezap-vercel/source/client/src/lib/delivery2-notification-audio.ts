export const delivery2OrdersSoundStorageKey = "delivery2-orders:sound-enabled";

let cachedDelivery2AudioUrl: string | null = null;

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function buildDelivery2AudioUrl() {
  const sampleRate = 22_050;
  const durationSeconds = 2.3;
  const totalSamples = Math.floor(sampleRate * durationSeconds);
  const notes = [
    { start: 0.0, end: 0.22, freq: 784, amp: 0.48 },
    { start: 0.14, end: 0.36, freq: 1174.7, amp: 0.3 },
    { start: 0.62, end: 0.96, freq: 988, amp: 0.4 },
    { start: 0.82, end: 1.16, freq: 1318.5, amp: 0.26 },
    { start: 1.45, end: 1.95, freq: 1046.5, amp: 0.34 },
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
      sample += note.amp * 0.16 * envelope * Math.sin(2 * Math.PI * note.freq * 2 * time);
    }

    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + sampleIndex * 2, Math.floor(clamped * 32767), true);
  }

  return URL.createObjectURL(new Blob([wavBuffer], { type: "audio/wav" }));
}

export function getDelivery2NotificationAudioUrl() {
  if (!cachedDelivery2AudioUrl) {
    cachedDelivery2AudioUrl = buildDelivery2AudioUrl();
  }

  return cachedDelivery2AudioUrl;
}

export function createDelivery2NotificationAudio() {
  const audio = new Audio(getDelivery2NotificationAudioUrl());
  audio.preload = "auto";
  audio.volume = 0.76;
  return audio;
}
