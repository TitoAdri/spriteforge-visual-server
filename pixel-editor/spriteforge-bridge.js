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

  function send(type, payload) {
    window.parent.postMessage(Object.assign({ source: SOURCE, type: type }, payload || {}), ORIGIN);
  }

  function base64(dataUrl) {
    return String(dataUrl || "").slice(String(dataUrl || "").indexOf(",") + 1);
  }

  function setPiskel(piskel, markDirty) {
    suppressDirty = true;
    pskl.app.piskelController.setPiskel(piskel);
    window.setTimeout(function () {
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

  function loadImage(url, name) {
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
        setPiskel(piskel, false);
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
      if (message.document) loadDocument(message.document, false); else if (message.sourceUrl) loadImage(message.sourceUrl, message.name);
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
    document.title = "SpriteForge · Manual editor";
    $.subscribe(Events.PISKEL_SAVE_STATE, function () { if (!suppressDirty && initialized) send("spriteforge:dirty"); });
    suppressDirty = false;
    send("spriteforge:ready", { version: pskl._releaseVersion || "0.15.2-SNAPSHOT" });
  });
})();
