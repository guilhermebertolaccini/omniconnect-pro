import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installErrorLogger } from "./lib/errorLogger";
import { installLogShipper } from "./lib/logShipper";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { initSentry } from "./lib/sentry";

initSentry();
installErrorLogger();
installLogShipper();

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
