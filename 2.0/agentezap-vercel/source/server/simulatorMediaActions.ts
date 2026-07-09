import { foldMediaName } from "./mediaService";
import { resolveCustomerFacingMediaCaption } from "./mediaCustomerCaption";
import { processResponsePlaceholders } from "./textUtils";

export function expandSimulatorMediaAction(action: any, mediaLibrary: any[], contactName?: string): any[] {
  if (action?.type === "send_text") {
    const text = processResponsePlaceholders(String(action.text || "").trim(), contactName);
    return text ? [{ type: "send_text", text }] : [];
  }

  if (action?.type === "send_media_url" && action.media_url) {
    const directAction: any = {
      type: "send_media_url",
      media_url: action.media_url,
      media_type: action.media_type || "image",
      caption: action.caption ? processResponsePlaceholders(String(action.caption), contactName) : "",
      media_name: action.media_name,
    };
    if (action.file_name) {
      directAction.file_name = action.file_name;
    }
    return [directAction];
  }

  if (action?.type !== "send_media" || !action.media_name) {
    return [];
  }

  const targetMediaName = foldMediaName(action.media_name);
  const mediaItem = mediaLibrary.find((item) => foldMediaName(item.name) === targetMediaName);
  if (!mediaItem) {
    return [];
  }

  if (mediaItem.mediaType !== "flow") {
    const singleAction: any = {
      type: "send_media",
      media_name: action.media_name,
      media_url: mediaItem.storageUrl,
      media_type: mediaItem.mediaType,
      caption: resolveCustomerFacingMediaCaption(mediaItem),
    };
    if (mediaItem.fileName) {
      singleAction.file_name = mediaItem.fileName;
    }
    return [singleAction];
  }

  const flowItems = Array.isArray(mediaItem.flowItems) ? [...mediaItem.flowItems] : [];
  const expanded: any[] = [];

  for (const item of flowItems.sort((a: any, b: any) => (a.order || 0) - (b.order || 0))) {
    if (item?.type === "text") {
      const text = processResponsePlaceholders(String(item.text || "").trim(), contactName);
      if (text) {
        expanded.push({ type: "send_text", text });
      }
      continue;
    }

    if (item?.type === "media" && item.storageUrl) {
      const flowAction: any = {
        type: "send_media_url",
        media_url: item.storageUrl,
        media_type: item.mediaType || "image",
        caption: item.caption ? processResponsePlaceholders(String(item.caption), contactName) : "",
        media_name: action.media_name,
      };
      if (item.fileName) {
        flowAction.file_name = item.fileName;
      }
      expanded.push(flowAction);
    }
  }

  return expanded;
}
