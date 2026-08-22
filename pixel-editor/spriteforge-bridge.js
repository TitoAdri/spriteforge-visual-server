/*
 * SpriteForge integration for Piskel 0.15.2-SNAPSHOT.
 * Modified integration file; Piskel remains Copyright 2017 Julian Descottes
 * and is distributed under the Apache License 2.0 in ./LICENSE.
 */
(function () {
  "use strict";

  var ORIGIN = window.location.origin;
  var SOURCE = "spriteforge-pixel-editor";
  var initialized = false;
  var suppressDirty = true;
  var referenceFrameIndex = null;

  function decorateFrameActions() {
    document.querySelectorAll(".delete-frame-action").forEach(function (action) { action.setAttribute("title", "Delete frame"); action.setAttribute("aria-label", "Delete frame"); });
    document.querySelectorAll(".duplicate-frame-action").forEach(function (action) { action.setAttribute("title", "Duplicate frame"); action.setAttribute("aria-label", "Duplicate frame"); });
  }

  function renderReferenceFrame() {
    var panel = document.querySelector("#spriteforge-reference-frame");
    if (!panel || !pskl.app.piskelController) return;
    var controller = pskl.app.piskelController;
    var frameCount = controller.getFrameCount();
    var toggle = document.querySelector("#spriteforge-reference-toggle");
    panel.classList.toggle("is-available", frameCount > 1);
    if (toggle) toggle.disabled = frameCount < 2;
    if (frameCount < 2) { panel.classList.remove("is-open"); document.querySelector(".main-column").classList.remove("reference-open"); return; }
    var active = controller.getCurrentFrameIndex();
    if (referenceFrameIndex === null) referenceFrameIndex = active > 0 ? active - 1 : Math.min(frameCount - 1, active + 1);
    referenceFrameIndex = Math.max(0, Math.min(frameCount - 1, referenceFrameIndex));
    var canvas = controller.renderFrameAt(referenceFrameIndex, true);
    var canvasSlot = panel.querySelector("[data-reference-canvas]");
    canvas.className = "spriteforge-reference-canvas";
    canvasSlot.replaceChildren(canvas);
    var scale = Math.max(1, Math.floor(Math.min(canvasSlot.clientWidth / canvas.width, canvasSlot.clientHeight / canvas.height)));
    canvas.style.width = (canvas.width * scale) + "px";
    canvas.style.height = (canvas.height * scale) + "px";
    panel.querySelector("[data-reference-label]").textContent = "Frame " + (referenceFrameIndex + 1) + " of " + frameCount;
    panel.querySelector("[data-reference-prev]").disabled = referenceFrameIndex === 0;
    panel.querySelector("[data-reference-next]").disabled = referenceFrameIndex === frameCount - 1;
  }

  function mountReferencePanel() {
    if (document.querySelector("#spriteforge-reference-frame")) return;
    var column = document.querySelector(".main-column");
    if (!column) return;
    var toggle = document.createElement("button");
    toggle.id = "spriteforge-reference-toggle";
    toggle.className = "spriteforge-reference-toggle";
    toggle.type = "button";
    toggle.disabled = true;
    toggle.innerHTML = '<span aria-hidden="true">◫</span><span>Reference</span>';
    var panel = document.createElement("section");
    panel.id = "spriteforge-reference-frame";
    panel.className = "spriteforge-reference-frame";
    panel.innerHTML = '<header><div><span>Reference frame</span><small data-reference-label></small></div><div><button type="button" data-reference-prev aria-label="Previous reference frame">‹</button><button type="button" data-reference-next aria-label="Next reference frame">›</button><button type="button" data-reference-close aria-label="Close reference">×</button></div></header><div class="spriteforge-reference-canvas-wrap" data-reference-canvas></div><p>Choose any frame below, then keep it beside the one you are painting.</p>';
    var togglePanel = function () {
      var open = !panel.classList.contains("is-open");
      panel.classList.toggle("is-open", open); column.classList.toggle("reference-open", open);
      toggle.setAttribute("aria-expanded", String(open)); toggle.classList.toggle("is-open", open);
      window.setTimeout(function () { window.dispatchEvent(new Event("resize")); $.publish(Events.FRAME_SIZE_CHANGED); renderReferenceFrame(); }, 40);
    };
    toggle.addEventListener("click", togglePanel);
    panel.querySelector("[data-reference-prev]").addEventListener("click", function () { referenceFrameIndex = Math.max(0, (referenceFrameIndex === null ? 0 : referenceFrameIndex) - 1); renderReferenceFrame(); });
    panel.querySelector("[data-reference-next]").addEventListener("click", function () { var count = pskl.app.piskelController.getFrameCount(); referenceFrameIndex = Math.min(count - 1, (referenceFrameIndex === null ? 0 : referenceFrameIndex) + 1); renderReferenceFrame(); });
    panel.querySelector("[data-reference-close]").addEventListener("click", function () { if (panel.classList.contains("is-open")) togglePanel(); });
    column.append(toggle, panel);
  }

  function restyleCanvasSurface() {
    var drawing = document.querySelector("#drawing-canvas-container");
    if (!drawing) return;
    drawing.style.setProperty("background", "#151b22", "important");
    drawing.querySelectorAll("canvas").forEach(function (canvas) { canvas.style.setProperty("background", "transparent", "important"); });
  }

  function send(type, payload) {
    window.parent.postMessage(Object.assign({ source: SOURCE, type: type }, payload || {}), ORIGIN);
  }

  function base64(dataUrl) {
    return String(dataUrl || "").slice(String(dataUrl || "").indexOf(",") + 1);
  }

  function setPiskel(piskel, markDirty, fps) {
    suppressDirty = true;
    pskl.app.piskelController.setPiskel(piskel);
    if (Number.isFinite(Number(fps)) && Number(fps) >= 1 && typeof pskl.app.piskelController.setFPS === "function") {
      pskl.app.piskelController.setFPS(Math.max(1, Math.min(60, Math.round(Number(fps)))));
    }
    window.setTimeout(function () {
      restyleCanvasSurface();
      decorateFrameActions();
      renderReferenceFrame();
      suppressDirty = false;
      if (markDirty) send("spriteforge:dirty");
    }, 100);
  }

  function loadDocument(serialized, markDirty) {
    try {
      var parsed = typeof serialized === "string" ? JSON.parse(serialized) : serialized;
      pskl.utils.serialization.Deserializer.deserialize(parsed, function (piskel) {
        setPiskel(piskel, markDirty);
        send("spriteforge:loaded");
      }, function () { send("spriteforge:error", { message: "The editable document could not be loaded." }); });
    } catch (error) {
      send("spriteforge:error", { message: "The editable document is invalid." });
    }
  }

  function loadImage(url, name, fps) {
    var image = new Image();
    image.onload = function () {
      if (image.naturalWidth > 1024 || image.naturalHeight > 1024) {
        send("spriteforge:error", { message: "Images must be 1024×1024 or smaller." });
        return;
      }
      pskl.app.importService.newPiskelFromImage(image, {
        importType: "single",
        name: name || "SpriteForge asset",
        smoothing: false,
        frameSizeX: image.naturalWidth,
        frameSizeY: image.naturalHeight,
        frameOffsetX: 0,
        frameOffsetY: 0
      }, function (piskel) {
        setPiskel(piskel, false, fps);
        send("spriteforge:loaded");
      });
    };
    image.onerror = function () { send("spriteforge:error", { message: "The asset image could not be loaded." }); };
    image.src = url;
  }

  function animatedGif(callback) {
    var exportController = { getExportZoom: function () { return 1; } };
    var controller = new pskl.controller.settings.exportimage.GifExportController(pskl.app.piskelController, exportController);
    controller.renderAsImageDataAnimatedGIF(1, pskl.app.piskelController.getFPS(), callback);
  }

  function snapshot(requestId) {
    try {
      var controller = pskl.app.piskelController;
      var piskel = controller.getPiskel();
      var frameCount = controller.getFrameCount();
      var payload = {
        requestId: requestId,
        document: pskl.utils.serialization.Serializer.serialize(piskel),
        gameReadyBase64: base64(pskl.app.getFirstFrameAsPng()),
        animationBase64: null,
        width: controller.getWidth(),
        height: controller.getHeight(),
        frameCount: frameCount,
        layerCount: controller.getLayers().length
      };
      if (frameCount === 1) {
        send("spriteforge:snapshot", payload);
        return;
      }
      var completed = false;
      var timeout = window.setTimeout(function () {
        if (!completed) send("spriteforge:error", { requestId: requestId, message: "The animated preview took too long to render." });
      }, 30000);
      animatedGif(function (dataUrl) {
        completed = true; window.clearTimeout(timeout); payload.animationBase64 = base64(dataUrl); send("spriteforge:snapshot", payload);
      });
    } catch (error) {
      send("spriteforge:error", { requestId: requestId, message: error && error.message ? error.message : "The editor snapshot could not be created." });
    }
  }

  function openSetting(setting) {
    if (pskl.app.settingsController && pskl.app.settingsController.loadSetting_) pskl.app.settingsController.loadSetting_(setting);
  }

  function toggleContrast() {
    var low = "lowcont-dark-canvas-background";
    var light = "light-canvas-background";
    var useLight = document.body.classList.contains(low);
    document.body.classList.toggle(low, !useLight);
    document.body.classList.toggle(light, useLight);
  }

  function downloadCurrent() {
    var controller = pskl.app.piskelController;
    var name = controller.getPiskel().getDescriptor().name || "spriteforge-asset";
    if (controller.getFrameCount() > 1) {
      animatedGif(function (dataUrl) { var link = document.createElement("a"); link.href = dataUrl; link.download = name + ".gif"; link.click(); });
    } else {
      var link = document.createElement("a"); link.href = pskl.app.getFirstFrameAsPng(); link.download = name + ".png"; link.click();
    }
  }

  function onMessage(event) {
    if (event.origin !== ORIGIN || event.source !== window.parent || !event.data || event.data.source !== "spriteforge-editor-shell") return;
    var message = event.data;
    if (message.type === "spriteforge:init") {
      initialized = true;
      if (message.document) loadDocument(message.document, false); else if (message.sourceUrl) loadImage(message.sourceUrl, message.name, message.fps);
    } else if (message.type === "spriteforge:load-document") loadDocument(message.document, true);
    else if (message.type === "spriteforge:request-snapshot") snapshot(message.requestId);
    else if (message.type === "spriteforge:command") {
      if (message.command === "preferences") openSetting("user");
      else if (message.command === "resize") openSetting("resize");
      else if (message.command === "export") openSetting("export");
      else if (message.command === "contrast") toggleContrast();
      else if (message.command === "download") downloadCurrent();
    }
  }

  window.addEventListener("message", onMessage);
  window.piskelReadyCallbacks = window.piskelReadyCallbacks || [];
  window.piskelReadyCallbacks.push(function () {
    // The packaged stylesheet is loaded asynchronously by Piskel. Load our
    // product theme last so legacy defaults cannot reintroduce grey surfaces.
    var theme = document.createElement("link");
    theme.rel = "stylesheet";
    theme.href = "spriteforge-theme.css?v=10";
    document.head.appendChild(theme);
    document.title = "SpriteForge · Manual editor";
    // SpriteForge validates editor limits on save. Piskel's legacy heuristic
    // warns for normal large sprites and creates an alarming false positive.
    if (pskl.service.performance?.PerformanceReport) {
      pskl.service.performance.PerformanceReport.prototype.hasProblem = function () { return false; };
    }
    // Piskel paints the unused area of its display canvas with this legacy grey
    // value, so CSS alone cannot restyle it. Keep the workspace surface aligned
    // with the SpriteForge palette whenever the renderer zooms the sprite out.
    if (typeof Constants !== "undefined") {
      Constants.ZOOMED_OUT_BACKGROUND_COLOR = "#151b22";
    }
    var performanceLink = document.querySelector(".performance-link");
    if (performanceLink) performanceLink.remove();
    restyleCanvasSurface();
    mountReferencePanel();
    $.subscribe(Events.PISKEL_RESET, function () { window.setTimeout(function () { decorateFrameActions(); renderReferenceFrame(); }, 0); });
    $.subscribe(Events.TOOL_RELEASED, function () { window.setTimeout(renderReferenceFrame, 0); });
    $.subscribe(Events.PISKEL_SAVE_STATE, function () { if (!suppressDirty && initialized) send("spriteforge:dirty"); });
    suppressDirty = false;
    send("spriteforge:ready", { version: pskl._releaseVersion || "0.15.2-SNAPSHOT" });
  });
})();
