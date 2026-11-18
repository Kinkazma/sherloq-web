var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/scheduled-worker-call.js
import { getExecutionScheduler } from "./execution-scheduler.js";
import { checkAbort } from "./errors.js";

// src/wavelet-strip-pool.js
import { EngineError, checkAbort as checkAbort2, requireValue, deserializeEngineError, normalizeResourceError as normalizeResourceError2, serializeEngineError, projectWaveletRetirementFailure, waveletRetirementOmission } from "./errors.js";

// src/adaptive-concurrency.js
import { normalizeResourceError, resourceAllocationKind } from "./errors.js";

// src/wavelet-strip-pool.js
import { installWorkerMessageProtocol, workerMessageFailure } from "./worker-message-protocol.js";
import { runWithResourceRecovery, reclaimForResourceRecovery } from "./resource-recovery.js";
var __sherloqOriginalModuleURL = new URL("./wavelet-strip-pool.js", import.meta.url).href;

// src/neural-window-worker-link.js
import { EngineError as EngineError5, requireValue as requireValue7 } from "./errors.js";

// src/neural-window-job-owner.js
import { EngineError as EngineError2, checkAbort as checkAbort3, requireValue as requireValue2 } from "./errors.js";
var neuralWindowBindingKeys = Object.freeze(["sourceId", "sourceSha256", "sourceWidth", "sourceHeight", "domainFingerprint", "generation", "family"]);

// src/neural-window-runtime-escrow.js
import { requireValue as requireValue3 } from "./errors.js";

// src/neural-window-peer.js
import { installWorkerMessageProtocol as installWorkerMessageProtocol3 } from "./worker-message-protocol.js";
import { EngineError as EngineError4, requireValue as requireValue6, deserializeEngineError as deserializeEngineError2 } from "./errors.js";

// src/neural-window-host.js
import { installWorkerMessageProtocol as installWorkerMessageProtocol2 } from "./worker-message-protocol.js";
import { EngineError as EngineError3, requireValue as requireValue4, serializeEngineError as serializeEngineError2 } from "./errors.js";

// src/neural-window-output-owner.js
import { allocateTypedArray } from "./allocation.js";
import { requireValue as requireValue5 } from "./errors.js";

// src/neural-window-engine-link.js
import { EngineError as EngineError6, requireValue as requireValue8 } from "./errors.js";
var post;
var current;
function installNeuralWindowControl(sender) {
  requireValue8(!post && typeof sender === "function", "One private Window controller may own this engine Worker.");
  post = sender;
}
__name(installNeuralWindowControl, "installNeuralWindowControl");
function neuralWindowControlMessage(message) {
  if (!message?.neuralWindowControl) return false;
  requireValue8(current, "No private Window bridge is awaiting a receipt.");
  return current.accept(message);
}
__name(neuralWindowControlMessage, "neuralWindowControlMessage");

// src/source-samples-control.js
import { EngineError as EngineError7, requireValue as requireValue9, serializeEngineError as serializeEngineError3, deserializeEngineError as deserializeEngineError3 } from "./errors.js";
var bindingKeys = ["imageId", "sourceSurfaceId", "sourceRevision", "sourceSha256", "kind"];
var sameBinding = /* @__PURE__ */ __name((a, b) => !!a && !!b && bindingKeys.every((key) => a[key] === b[key]), "sameBinding");
var nonce = /* @__PURE__ */ __name(() => crypto.randomUUID(), "nonce");
var metadataBytes = /* @__PURE__ */ __name((...strings) => 1024 + 4 * strings.reduce((sum, value) => sum + String(value ?? "").length, 0), "metadataBytes");
var encode = /* @__PURE__ */ __name((value) => value === null || ["undefined", "boolean", "number", "string"].includes(typeof value) ? { primitive: true, type: typeof value, ...value === void 0 ? {} : { value } } : { engine: serializeEngineError3(value) }, "encode");
function captureBinding(value) {
  requireValue9(value && typeof value.imageId === "string" && value.imageId.length && typeof value.sourceSurfaceId === "string" && value.sourceSurfaceId.length && Number.isSafeInteger(value.sourceRevision) && value.sourceRevision > 0 && /^[a-f0-9]{64}$/.test(value.sourceSha256 ?? "") && ["encoded", "fixture"].includes(value.kind), "An established source content binding is required.");
  return Object.freeze(Object.fromEntries(bindingKeys.map((key) => [key, value[key]])));
}
__name(captureBinding, "captureBinding");
function captureRequest(value) {
  requireValue9(value && typeof value.sourceLeaseId === "string" && value.sourceLeaseId.length && typeof value.sourceId === "string" && value.sourceId.length && Number.isSafeInteger(value.revision) && value.revision > 0 && ["decoded", "sensor"].includes(value.domain) && (value.frame === void 0 || value.frame === 0) && (value.windowLeaseId === void 0 || typeof value.windowLeaseId === "string" && value.windowLeaseId.length), "Invalid source retirement request.");
  return Object.freeze({
    sourceLeaseId: value.sourceLeaseId,
    sourceId: value.sourceId,
    revision: value.revision,
    domain: value.domain,
    frame: 0,
    bindingOriginal: captureBinding(value.bindingOriginal),
    ...value.windowLeaseId ? { windowLeaseId: value.windowLeaseId } : {}
  });
}
__name(captureRequest, "captureRequest");
var sameSource = /* @__PURE__ */ __name((a, b) => a.sourceLeaseId === b.sourceLeaseId && a.sourceId === b.sourceId && a.revision === b.revision && a.domain === b.domain && a.frame === b.frame && sameBinding(a.bindingOriginal, b.bindingOriginal), "sameSource");
var requestIdentity = /* @__PURE__ */ __name((value) => JSON.stringify([
  value.sourceLeaseId,
  value.sourceId,
  value.revision,
  value.domain,
  value.frame,
  ...bindingKeys.map((key) => value.bindingOriginal[key]),
  value.windowLeaseId ?? null
]), "requestIdentity");
function windowSequence(request) {
  const prefix = request.sourceLeaseId + "/w/", id = request.windowLeaseId, sequence = Number(id?.slice(prefix.length));
  return id?.startsWith(prefix) && Number.isSafeInteger(sequence) && sequence > 0 && String(sequence) === id.slice(prefix.length) ? sequence : null;
}
__name(windowSequence, "windowSequence");
var retiredWindow = /* @__PURE__ */ __name((row, sequence) => sequence !== null && (sequence <= row.retiredThrough || row.retiredRanges.some((range) => sequence >= range.first && sequence <= range.last)), "retiredWindow");
function acknowledgeWindow(row, sequence, fee = () => {
}) {
  if (retiredWindow(row, sequence)) {
    fee();
    return;
  }
  row.retiredRanges.push({ first: sequence, last: sequence, fee });
  row.retiredRanges.sort((a, b) => a.first - b.first);
  for (let i = 1; i < row.retiredRanges.length; ) {
    const previous = row.retiredRanges[i - 1], next = row.retiredRanges[i];
    if (next.first <= previous.last + 1) {
      previous.last = Math.max(previous.last, next.last);
      next.fee();
      row.retiredRanges.splice(i, 1);
    } else i++;
  }
  while (row.retiredRanges[0]?.first <= row.retiredThrough + 1) {
    const range = row.retiredRanges.shift();
    row.retiredThrough = Math.max(row.retiredThrough, range.last);
    range.fee();
  }
}
__name(acknowledgeWindow, "acknowledgeWindow");
function createSourceSamplesControlServer({ post: post2 } = {}) {
  requireValue9(typeof post2 === "function", "A captured Worker control sender is required.");
  let epoch, services, registrations;
  const getRegistration = /* @__PURE__ */ __name((control) => {
    const row = registrations?.get(control);
    requireValue9(row, "Unknown captured source control registration.");
    return row;
  }, "getRegistration");
  const getSource = /* @__PURE__ */ __name((row, request) => {
    const source = row.sources.get(request.sourceLeaseId);
    requireValue9(source && sameSource(source.request, request), "Source control receipt binding differs.");
    return source;
  }, "getSource");
  const discardWindow = /* @__PURE__ */ __name((source, id) => {
    const value = source.windows.get(id);
    if (value) {
      value.fee();
      source.windows.delete(id);
    }
  }, "discardWindow");
  const releaseWindow = /* @__PURE__ */ __name((source, request) => {
    const value = source.windows.get(request.windowLeaseId);
    if (value) {
      source.windows.delete(request.windowLeaseId);
      acknowledgeWindow(source, windowSequence(request), value.fee);
    }
  }, "releaseWindow");
  function finishService(row) {
    for (const source of row.sources.values()) {
      for (const window of source.windows.values()) window.fee();
      source.windows.clear();
      for (const range of source.retiredRanges) range.fee();
      source.retiredRanges.length = 0;
      source.fee();
    }
    row.sources.clear();
    for (const pending of row.requests.values()) pending.fee();
    row.requests.clear();
    row.fee();
    row.acknowledged = true;
    services.delete(row.key.serviceId);
    row.closeResolve?.();
  }
  __name(finishService, "finishService");
  const server = {
    register(service, bindingOriginal, budget) {
      requireValue9(service && typeof service.retireSourceSamples === "function" && budget?.reserve, "A source owner and its real budget are required.");
      const binding = captureBinding(bindingOriginal), bytes = metadataBytes(...bindingKeys.map((key2) => binding[key2])), fee = budget.reserve(bytes);
      let key;
      try {
        epoch ??= nonce();
        key = Object.freeze({ workerEpoch: epoch, serviceId: nonce(), nonce: nonce(), bindingOriginal: binding });
      } catch (error) {
        fee();
        throw error;
      }
      services ??= /* @__PURE__ */ new Map();
      registrations ??= /* @__PURE__ */ new WeakMap();
      const row = { key, service, budget, fee, registrationBytes: bytes, sources: /* @__PURE__ */ new Map(), requests: /* @__PURE__ */ new Map(), closeFlight: null, acknowledged: false, closure: null };
      services.set(key.serviceId, row);
      registrations.set(key, row);
      return key;
    },
    adoptSource(control, reply, { unpublished = false } = {}) {
      const row = getRegistration(control), request = captureRequest(reply);
      requireValue9(!row.closure && !row.acknowledged && sameBinding(row.key.bindingOriginal, request.bindingOriginal), "Source registration is closing or belongs to another Original.");
      const existing = row.sources.get(request.sourceLeaseId);
      if (existing) {
        requireValue9(sameSource(existing.request, request), "Source lease was rebound.");
        return existing.capability;
      }
      const bytes = 2 * metadataBytes(requestIdentity(request)), fee = row.budget.reserve(bytes);
      let capability;
      try {
        capability = Object.freeze({ ...row.key, sourceLeaseId: request.sourceLeaseId, sourceNonce: nonce(), metadataBytes: bytes + row.registrationBytes });
      } catch (error) {
        fee();
        throw error;
      }
      row.sources.set(request.sourceLeaseId, { request, capability, fee, windows: /* @__PURE__ */ new Map(), retiredThrough: 0, retiredRanges: [], published: !unpublished });
      return capability;
    },
    async publishSource(control, reply, publish) {
      const row = getRegistration(control), request = captureRequest(reply), source = getSource(row, request);
      requireValue9(!source.published && typeof publish === "function", "Source response is already published.");
      const token = source.publicationToken ??= new ArrayBuffer(1);
      try {
        const result = await publish({ ...reply, sourceSamplesPublication: token }, [token]);
        if (result === false || result === 0) throw result;
        source.published = true;
      } catch (error) {
        if (token.byteLength === 0) source.published = true;
        throw error;
      }
    },
    sourceWasPublished(control, reply) {
      return getSource(getRegistration(control), captureRequest(reply)).published;
    },
    discardUnpublishedSource(control, reply) {
      const row = getRegistration(control), request = captureRequest(reply), source = getSource(row, request);
      requireValue9(!source.published && !source.windows.size && !source.retiredRanges.length, "A published source cannot be discarded locally.");
      source.fee();
      row.sources.delete(request.sourceLeaseId);
    },
    async publishWindow(control, wire, transfer, publish) {
      const row = getRegistration(control), request = captureRequest(wire), source = getSource(row, request);
      requireValue9(!row.closure && typeof publish === "function" && wire.samples?.buffer instanceof ArrayBuffer, "Source window publication is unavailable.");
      const prefix = request.sourceLeaseId + "/w/", sequence = Number(request.windowLeaseId?.slice(prefix.length));
      requireValue9(request.windowLeaseId?.startsWith(prefix) && Number.isSafeInteger(sequence) && sequence > 0 && String(sequence) === request.windowLeaseId.slice(prefix.length) && !source.windows.has(request.windowLeaseId) && !retiredWindow(source, sequence), "Unexpected source window sequence.");
      const bytes = metadataBytes(request.windowLeaseId) + 2 * metadataBytes(requestIdentity(request)), fee = row.budget.reserve(bytes), window = { fee, posted: false };
      source.windows.set(request.windowLeaseId, window);
      const buffer = wire.samples.buffer;
      try {
        await publish({ ...wire, sourceSamplesWindowCredit: { bytes, sourceNonce: source.capability.sourceNonce } }, transfer);
        window.posted = true;
      } catch (error) {
        if (buffer.byteLength > 0) discardWindow(source, request.windowLeaseId);
        else window.posted = true;
        throw error;
      }
    },
    close(control) {
      const row = getRegistration(control);
      if (row.acknowledged) return Promise.resolve();
      if (row.closeFlight) return row.closeFlight;
      requireValue9(row.service.state?.closed === true, "A live source service cannot be retired.");
      if (!row.sources.size) {
        finishService(row);
        return Promise.resolve();
      }
      row.closure ??= nonce();
      const task = new Promise((resolve, reject) => {
        row.closeResolve = resolve;
        row.closeReject = reject;
        try {
          post2({ sourceSamplesServiceClosed: { ...row.key, closure: row.closure } });
        } catch (error) {
          reject(error);
        }
      });
      row.closeFlight = task;
      task.then(() => {
        row.closeFlight = null;
      }, () => {
        row.closeFlight = null;
      });
      return task;
    },
    accept(packet) {
      const c = packet?.sourceSamplesControl;
      if (!c) return false;
      void (async () => {
        let row, request, source, key, pending;
        try {
          requireValue9(c && Number.isSafeInteger(c.ticket) && c.ticket > 0 && c.workerEpoch === epoch && typeof c.serviceId === "string", "Invalid source control epoch or envelope.");
          row = services?.get(c.serviceId);
          requireValue9(row && c.nonce === row.key.nonce, "Unknown source control capability.");
          if (c.action === "service-closed-ack") {
            requireValue9(row.closure && c.closure === row.closure && sameBinding(c.bindingOriginal, row.key.bindingOriginal) && row.service.state?.closed === true, "Invalid service closure ACK.");
            post2({ sourceSamplesServiceClosedAck: { ...row.key, closure: row.closure } });
            finishService(row);
            return;
          }
          requireValue9(c.action === "retire" && !row.acknowledged, "Unknown source control action.");
          request = captureRequest(c.request);
          source = getSource(row, request);
          requireValue9(c.sourceNonce === source.capability.sourceNonce, "Source receipt capability differs.");
          if (request.windowLeaseId) {
            const sequence = windowSequence(request);
            requireValue9(sequence !== null && (source.windows.has(request.windowLeaseId) || retiredWindow(source, sequence)), "Source window receipt was not published or acknowledged.");
          }
          key = requestIdentity(request);
          pending = row.requests.get(key);
          if (!pending) {
            pending = { fee: /* @__PURE__ */ __name(() => {
            }, "fee"), ticket: c.ticket, posting: null, task: Promise.resolve().then(() => row.service.retireSourceSamples(request)) };
            row.requests.set(key, pending);
          }
          requireValue9(pending.ticket === c.ticket, "A control retry must reuse its captured ticket.");
          if (!pending.posting) {
            const posting = (async () => {
              let result, error, rejected = false;
              try {
                result = await pending.task;
              } catch (reason) {
                error = reason;
                rejected = true;
              }
              post2({ sourceSamplesControlAck: {
                ticket: pending.ticket,
                workerEpoch: epoch,
                serviceId: row.key.serviceId,
                nonce: row.key.nonce,
                sourceNonce: source.capability.sourceNonce,
                requestIdentity: key,
                ...rejected ? { failed: true, error: encode(error) } : { result }
              } });
              if (row.requests.get(key) === pending) {
                if (!rejected && request.windowLeaseId) releaseWindow(source, request);
                pending.fee();
                row.requests.delete(key);
              }
            })();
            pending.posting = posting;
            posting.then(() => {
              pending.posting = null;
            }, () => {
              pending.posting = null;
            });
          }
          await pending.posting;
        } catch (error) {
          if (!pending) try {
            post2({ sourceSamplesControlAck: {
              ticket: c.ticket,
              workerEpoch: c.workerEpoch,
              serviceId: c.serviceId,
              nonce: c.nonce,
              sourceNonce: c.sourceNonce,
              requestIdentity: request ? requestIdentity(request) : null,
              failed: true,
              error: encode(error)
            } });
          } catch {
          }
          if (c.action === "service-closed-ack" && row?.closure) row.closeReject?.(error);
        }
      })();
      return true;
    },
    get state() {
      return {
        services: services?.size ?? 0,
        sources: [...services?.values() ?? []].reduce((n, row) => n + row.sources.size, 0),
        windows: [...services?.values() ?? []].reduce((n, row) => n + [...row.sources.values()].reduce((m, source) => m + source.windows.size, 0), 0),
        controls: [...services?.values() ?? []].reduce((n, row) => n + row.requests.size, 0)
      };
    }
  };
  return server;
}
__name(createSourceSamplesControlServer, "createSourceSamplesControlServer");

// src/worker.js
import { EngineError as EngineError8, serializeEngineError as serializeEngineError4, normalizeResourceError as normalizeResourceError3, serializeEngineErrorWithCleanupSummaries } from "./errors.js";
import { installWorkerMessageProtocol as installWorkerMessageProtocol4, workerMessageFailure as workerMessageFailure2 } from "./worker-message-protocol.js";
var __sherloqOriginalModuleURL2 = new URL("./worker.js", import.meta.url).href;
installNeuralWindowControl((message) => self.postMessage(message));
var engine;
var currentController;
var currentSequence;
var loadBlobStorageOwner;
var stopping = false;
var shutdown;
var cacheTicket = 0;
var cacheRetirements = /* @__PURE__ */ new Map();
var sourceSamplesControl;
var sourceSamplesControlFactory = /* @__PURE__ */ __name(() => sourceSamplesControl ??= createSourceSamplesControlServer({ post: /* @__PURE__ */ __name((message) => self.postMessage(message), "post") }), "sourceSamplesControlFactory");
function requestCacheRetirement(request) {
  const ticket = ++cacheTicket;
  return new Promise((resolve, reject) => {
    cacheRetirements.set(ticket, { resolve, reject });
    try {
      self.postMessage({ externalCacheReclaim: { ...request, ticket } });
    } catch (error) {
      cacheRetirements.delete(ticket);
      reject(error);
    }
  });
}
__name(requestCacheRetirement, "requestCacheRetirement");
function closeForCancellation() {
  if (shutdown) return shutdown;
  shutdown = (async () => {
    const diagnostics = engine?.waveletRetirementDiagnostics;
    let diagnosticScope;
    try {
      diagnosticScope = diagnostics?.begin({ method: "shutdown" });
      self.postMessage({ shutdownPhase: "closing-storage" });
      await engine?.dispose();
      self.postMessage({ storageClosed: true });
    } catch (error) {
      const summary = serializeEngineErrorWithCleanupSummaries(error, diagnostics?.snapshot(diagnosticScope));
      self.postMessage({ storageClosed: false, shutdownError: { ...summary, code: error?.code ?? "INTERNAL" } });
    } finally {
      diagnostics?.end(diagnosticScope);
    }
  })();
  return shutdown;
}
__name(closeForCancellation, "closeForCancellation");
installWorkerMessageProtocol4(self, async (packet) => {
  if (packet.sourceSamplesControl) {
    sourceSamplesControl?.accept(packet);
    return;
  }
  if (neuralWindowControlMessage(packet)) return;
  const { sequence, method, args, options } = packet;
  if (method === "external-cache-retired") {
    if (!Number.isSafeInteger(sequence) || sequence < 1 || !Array.isArray(args) || args.length > 1 || args.length === 1 && (!args[0]?.error || typeof args[0].error.code !== "string" || !args[0].error.code || typeof args[0].error.message !== "string")) throw workerMessageFailure2("engine", "message", "invalid-external-cache-ack");
    const waiting = cacheRetirements.get(sequence);
    if (waiting) {
      cacheRetirements.delete(sequence);
      args?.[0]?.error ? waiting.reject(new EngineError8(args[0].error.code ?? "EXTERNAL_CACHE_RETIRE_FAILED", args[0].error.message ?? "External cache retirement failed.")) : waiting.resolve();
    }
    return;
  }
  if (method === "cancel-task") {
    if (currentSequence === sequence) currentController?.abort();
    return;
  }
  if (method === "cancel-and-close") {
    stopping = true;
    self.postMessage({ shutdownPhase: "abort-received" });
    currentController?.abort();
    if (!currentController) await closeForCancellation();
    return;
  }
  if (!Number.isSafeInteger(sequence) || typeof method !== "string" || !Array.isArray(args)) throw workerMessageFailure2("engine", "message", "invalid-command");
  if (["capabilities", "updateResourceHints", "describeUsefulOperation"].includes(method)) {
    try {
      if (stopping || !engine) throw new EngineError8("DISPOSED", "Engine is not available.");
      self.postMessage({ sequence, result: method === "capabilities" ? engine.capabilities() : method === "describeUsefulOperation" ? engine.describeUsefulOperation(args[0]) : engine.updateResourceHints(args[0]) });
    } catch (error) {
      self.postMessage({ sequence, error: serializeEngineError4(error) });
    }
    return;
  }
  if (currentController) {
    self.postMessage({ sequence, error: serializeEngineError4(new EngineError8("BUSY", "Another worker task is active.")) });
    return;
  }
  const controller = new AbortController();
  currentController = controller;
  currentSequence = sequence;
  let diagnosticScope, loadBlobPublished = false;
  try {
    let collect = /* @__PURE__ */ __name(function(value) {
      if (ArrayBuffer.isView(value)) {
        buffers.add(value.buffer);
        return;
      }
      if (value && typeof value === "object") for (const child of Object.values(value)) collect(child);
    }, "collect");
    if (stopping) return;
    if (method === "init") {
      const moduleURL = new URL("./index.js", __sherloqOriginalModuleURL2).href;
      let createEngine;
      try {
        ({ createEngine } = await import("./engine-library-bundle-82e9ef7ba87ab659f83b.mjs"));
      } catch (cause) {
        const explicitDownload = cause?.code === "NETWORK_TRANSIENT" || cause?.name === "TypeError" && /Failed to fetch dynamically imported module|error loading dynamically imported module/i.test(cause.message ?? "") && !/content security|\bCSP\b|MIME|CORS|denied|blocked/i.test(cause.message ?? "");
        throw new EngineError8("WORKER_LOAD_FAILED", cause?.message || "Browser engine module could not be loaded.", { cause, details: { phase: "module-load", moduleURL, retryable: explicitDownload } });
      }
      if (stopping) return;
      try {
        engine = createEngine({ ...options, sourceSamplesControlFactory, waveletRetirementDiagnostics: true, onTemporarySession: /* @__PURE__ */ __name((storageSession) => self.postMessage({ storageSession, ...loadBlobStorageOwner ? { loadBlobStorageOwner } : {} }), "onTemporarySession"), onExternalCacheReclaim: requestCacheRetirement });
      } catch (cause) {
        const error = normalizeResourceError3(cause), failure = error?.code ? error : new EngineError8("WORKER_INITIALIZATION_FAILED", cause?.message || "Browser engine could not be initialized.", { cause });
        failure.details = { ...failure.details, phase: "engine-create", moduleURL };
        throw failure;
      }
      self.postMessage({ sequence, result: engine.capabilities() });
      return;
    }
    if (!engine || !["finalResultLifetime", "prepareSourceSamples", "readSourceSamples", "elaSynthesisAxis", "elaSynthesisBudgetPlan", "beginElaSynthesis", "runElaSynthesisFrame", "appendElaSynthesis", "finishElaSynthesis", "renderElaSynthesis", "runElaSynthesisEnergy", "disposeElaSynthesis", "selectedElaAutoStats", "describeUsefulOperation", "describeOcrUsefulWork", "reserveExternalCache", "updateExternalCache", "releaseExternalCache", "reserveExternalMemory", "releaseExternalMemory", "capabilities", "load", "loadBlob", "loadAutomaticModels", "resumeAutomatic", "updateAutomatic", "renderAutomatic", "previewAutomaticD2", "exportAutomatic", "exportResultFile", "releaseAutomatic", "inspectHeaders", "inspectMetadata", "deriveOriginal", "deriveSourceRegionInput", "releaseSurface", "readPlane", "exportSurface", "exportPixelBuffer", "readExport", "releaseExport", "readDisplay", "readPixels", "readNativePixels", "readMask", "readFlags", "readTable", "readTableCsv", "readNpz", "releaseTable", "originalBlob", "readOriginal", "loadMedianModel", "loadQualityModel", "loadD2prlModel", "unloadD2prlModel", "readD2prlRaw", "loadOcrModels", "unloadOcrModels", "loadM3Models", "unloadM3Models", "loadAiDetectors", "unloadAiDetectors", "loadExtensionModels", "unloadExtensionModels", "runExtensions", "loadSegmentationModel", "unloadSegmentationModel", "readSegmentationRaw", "loadPrnuDatabase", "buildPrnuDatabase", "createPrnuDatabaseExport", "exportPrnuDatabase", "previewParameters", "localizeRetainedParameters", "renderRetainedNativeParameters", "run", "exportResult", "original", "imagePixels", "unload", "dispose"].includes(method)) throw new Error("Invalid worker method.");
    if (["prepareSourceSamples", "readSourceSamples"].includes(method) && typeof engine[method] !== "function") throw new EngineError8("SOURCE_SAMPLES_UNAVAILABLE", "Source sample providers are not installed.");
    diagnosticScope = engine.waveletRetirementDiagnostics?.begin({ sequence, method });
    if (method === "reserveExternalMemory") await engine.prepareExternalCacheHeadroom?.(args[0], { signal: controller.signal });
    else if (["load", "loadBlob", "loadAutomaticModels", "loadMedianModel", "loadQualityModel", "loadD2prlModel", "loadOcrModels", "loadM3Models", "loadAiDetectors", "loadExtensionModels", "loadSegmentationModel", "loadPrnuDatabase", "buildPrnuDatabase", "deriveOriginal", "resumeAutomatic", "updateAutomatic", "renderAutomatic", "previewAutomaticD2", "exportAutomatic", "exportResultFile", "exportSurface", "exportPixelBuffer", "createPrnuDatabaseExport", "exportPrnuDatabase", "unload"].includes(method)) await engine.prepareExternalCacheHeadroom?.({ all: true }, { signal: controller.signal });
    if (method === "prepareSourceSamples") {
      await engine.prepareSourceSamples(args[0], { signal: controller.signal, publish: /* @__PURE__ */ __name((result2, transfer) => self.postMessage({ sequence, result: result2 }, transfer), "publish") });
      return;
    }
    if (method === "readSourceSamples") {
      await engine.readSourceSamples(args[0], { signal: controller.signal, publish: /* @__PURE__ */ __name((result2, transfer) => self.postMessage({ sequence, result: result2 }, transfer), "publish") });
      return;
    }
    if (method === "loadBlob") loadBlobStorageOwner = args[0]?.temporarySessionId;
    const result = await engine[method](...args, ...["prepareSourceSamples", "elaSynthesisAxis", "elaSynthesisBudgetPlan", "beginElaSynthesis", "runElaSynthesisFrame", "appendElaSynthesis", "finishElaSynthesis", "renderElaSynthesis", "runElaSynthesisEnergy", "disposeElaSynthesis", "selectedElaAutoStats", "reserveExternalCache", "updateExternalCache", "load", "loadBlob", "loadAutomaticModels", "resumeAutomatic", "updateAutomatic", "renderAutomatic", "previewAutomaticD2", "exportAutomatic", "exportResultFile", "releaseAutomatic", "inspectHeaders", "inspectMetadata", "deriveOriginal", "deriveSourceRegionInput", "releaseSurface", "readPlane", "exportSurface", "exportPixelBuffer", "readExport", "releaseExport", "readDisplay", "readPixels", "readNativePixels", "readMask", "readFlags", "readTable", "readTableCsv", "readNpz", "releaseTable", "readOriginal", "loadMedianModel", "loadQualityModel", "loadD2prlModel", "loadOcrModels", "loadAiDetectors", "loadExtensionModels", "runExtensions", "loadSegmentationModel", "loadPrnuDatabase", "buildPrnuDatabase", "createPrnuDatabaseExport", "previewParameters", "localizeRetainedParameters", "renderRetainedNativeParameters", "run"].includes(method) ? [{ signal: controller.signal, onProgress: /* @__PURE__ */ __name((progress) => self.postMessage({ sequence, progress }), "onProgress") }] : []);
    if (method === "loadBlob") loadBlobPublished = true;
    if (stopping) return;
    const buffers = /* @__PURE__ */ new Set();
    collect(result);
    self.postMessage({ sequence, result }, [...buffers]);
  } catch (error) {
    const loadBlobRetirement = method === "loadBlob" ? loadBlobPublished ? "published" : error?.cleanupOwner ? "core" : error?.temporaryCleanupError ? "terminated-worker" : "acknowledged" : null;
    if (controller.signal.aborted && error?.code !== "CANCELLED") error = new EngineError8("CANCELLED", "Task cancelled cooperatively.", { cause: error });
    if (!stopping) self.postMessage({ sequence, error: serializeEngineErrorWithCleanupSummaries(error, engine?.waveletRetirementDiagnostics?.snapshot(diagnosticScope)), ...loadBlobRetirement ? { loadBlobRetirement } : {} });
  } finally {
    if (method === "loadBlob") loadBlobStorageOwner = null;
    engine?.waveletRetirementDiagnostics?.end(diagnosticScope);
    if (currentController === controller) {
      currentController = null;
      currentSequence = null;
    }
    if (stopping) await closeForCancellation();
  }
}, { label: "engine", onFailure(error) {
  stopping = true;
  currentController?.abort();
  for (const waiting of cacheRetirements.values()) waiting.reject(error);
  cacheRetirements.clear();
  try {
    self.postMessage({ fatal: serializeEngineError4(error) });
  } finally {
    if (!currentController) void closeForCancellation();
  }
} });
