import assert from "node:assert/strict";
import { expandSimulatorMediaAction } from "../simulatorMediaActions";

const mediaLibrary = [
  {
    name: "FUNIL_TESTE",
    mediaType: "flow",
    flowItems: [
      { type: "text", text: "Primeiro texto", order: 0 },
      {
        type: "media",
        mediaType: "audio",
        storageUrl: "https://cdn.exemplo.com/audio.mp3",
        caption: "Audio de abertura",
        order: 1,
      },
      {
        type: "media",
        mediaType: "video",
        storageUrl: "https://cdn.exemplo.com/video.mp4",
        caption: "Video principal",
        order: 2,
      },
    ],
  },
];

const expanded = expandSimulatorMediaAction(
  {
    type: "send_media",
    media_name: "FUNIL_TESTE",
  },
  mediaLibrary,
);

assert.equal(expanded.length, 3);
assert.deepEqual(expanded[0], {
  type: "send_text",
  text: "Primeiro texto",
});
assert.deepEqual(expanded[1], {
  type: "send_media_url",
  media_url: "https://cdn.exemplo.com/audio.mp3",
  media_type: "audio",
  caption: "Audio de abertura",
  media_name: "FUNIL_TESTE",
});
assert.deepEqual(expanded[2], {
  type: "send_media_url",
  media_url: "https://cdn.exemplo.com/video.mp4",
  media_type: "video",
  caption: "Video principal",
  media_name: "FUNIL_TESTE",
});

const singleMediaExpanded = expandSimulatorMediaAction(
  {
    type: "send_media",
    media_name: "PORTFOLIO",
  },
  [
    {
      name: "PORTFOLIO",
      mediaType: "document",
      storageUrl: "https://cdn.exemplo.com/portfolio.pdf",
      description: "interna",
      caption: "",
    },
  ],
);

assert.deepEqual(singleMediaExpanded, [
  {
    type: "send_media",
    media_name: "PORTFOLIO",
    media_url: "https://cdn.exemplo.com/portfolio.pdf",
    media_type: "document",
    caption: undefined,
  },
]);

console.log("testAgentService.flowActions.test.ts ok");
process.exit(0);
