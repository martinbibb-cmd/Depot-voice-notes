/* app.js (manual transcript boot, no browser recording) */

const $ = (sel) => document.querySelector(sel);

const el = {
  workerStatus: $('[data-ui="worker-status"]') || $('[data-worker-status]'),
  workerError: $('[data-ui="worker-error"]') || $('[data-worker-error]'),
  transcript: $('[data-ui="transcript-out"]') || $('#out'),
  sendBtn: $('[data-ui="send-notes"]'),
  shareBtn: $('[data-ui="share-notes"]'),
};

function setStatus(text) {
  if (el.workerStatus) el.workerStatus.textContent = text;
  console.log("[worker]", text);
}

function showErr(text) {
  if (el.workerError) {
    el.workerError.hidden = false;
    el.workerError.textContent = text;
  }
  console.error("[worker:error]", text);
}

function showSuccess(text) {
  console.log("[success]", text);
}

async function boot() {
  if (el.workerError) el.workerError.hidden = true;
  setStatus("Ready for pasted transcript");

  if (el.sendBtn) {
    el.sendBtn.addEventListener("click", () => {
      const text = (el.transcript?.value || "").trim();
      if (!text) {
        showErr("Paste or type notes before sending");
        return;
      }
      console.log("[send-notes]", { text });
      // Keep the existing Cloudflare Worker integration point here.
      // fetch(CF_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ transcript: text }) })
      //   .then((r) => r.json()).then((j) => console.log("sent", j)).catch((e) => console.error("send failed", e));
    });
  }

  if (el.shareBtn) {
    el.shareBtn.addEventListener("click", async () => {
      const text = (el.transcript?.value || "").trim();
      if (!text) {
        showErr("No notes to share");
        return;
      }

      if (navigator.share) {
        try {
          await navigator.share({
            title: "Depot Notes",
            text,
          });
          console.log("[share] success");
        } catch (err) {
          if (err.name !== "AbortError") {
            console.error("[share] error", err);
            showErr(`Share failed: ${err.message}`);
          }
        }
        return;
      }

      try {
        await navigator.clipboard.writeText(text);
        showSuccess("Notes copied to clipboard");
        alert("Notes copied to clipboard.");
      } catch (err) {
        console.error("[share:clipboard] error", err);
        showErr("Share not supported and clipboard copy failed");
      }
    });
  }
}

document.addEventListener("DOMContentLoaded", boot);
