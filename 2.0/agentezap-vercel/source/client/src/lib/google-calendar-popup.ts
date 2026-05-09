const GOOGLE_CALENDAR_POPUP_EVENT = "google-calendar-connected";

export type GoogleCalendarPopupResult = {
  success: boolean;
  message?: string | null;
  googleEmail?: string | null;
};

export function openGoogleCalendarPopup(url: string, popupName = "google-calendar-connect") {
  const width = 560;
  const height = 760;
  const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
  const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));
  const popup = window.open(
    url,
    popupName,
    `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`,
  );

  if (!popup) {
    window.location.href = url;
    return Promise.resolve<GoogleCalendarPopupResult>({
      success: true,
      message: null,
      googleEmail: null,
    });
  }

  popup.focus();

  return new Promise<GoogleCalendarPopupResult>((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      window.removeEventListener("message", handleMessage);
      window.clearInterval(checkClosedInterval);
    };

    const finish = (result: GoogleCalendarPopupResult) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      resolve(result);
    };

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }

      const payload = event.data;
      const eventType = typeof payload?.source === "string" ? payload.source : payload?.type;
      if (eventType !== GOOGLE_CALENDAR_POPUP_EVENT) {
        return;
      }

      finish({
        success: Boolean(payload.success),
        message: typeof payload.message === "string" ? payload.message : null,
        googleEmail: typeof payload.googleEmail === "string" ? payload.googleEmail : null,
      });
    };

    const checkClosedInterval = window.setInterval(() => {
      if (!popup.closed || settled) {
        return;
      }

      cleanup();
      reject(new Error("A janela de conexao Google foi fechada antes de concluir."));
    }, 500);

    window.addEventListener("message", handleMessage);
  });
}
