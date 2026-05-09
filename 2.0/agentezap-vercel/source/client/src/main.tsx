import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { registerPwaServiceWorker, startPwaVersionMonitor } from "./lib/pwa";
import { initializeNativeAppShell, installNativeFetchBridge, isNativeApp } from "./lib/native-runtime";

installNativeFetchBridge();

if (!isNativeApp()) {
  void registerPwaServiceWorker();
  startPwaVersionMonitor();
} else {
  void initializeNativeAppShell();
}

createRoot(document.getElementById("root")!).render(<App />);
