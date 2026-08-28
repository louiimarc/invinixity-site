export function normalizeSlideshowContent(candidate) {
  const source = Array.isArray(candidate) ? candidate : candidate?.slides;
  if (!Array.isArray(source) || source.length === 0) throw new Error("slideshow must contain a non-empty slides array");
  const slides = source.slice(0, 500).map((entry, index) => {
    const slide = typeof entry === "string" ? { text: entry } : entry;
    if (!slide || typeof slide !== "object") throw new Error(`slide ${index + 1} must be text or an object`);
    const text = cleanText(slide.text, 500);
    if (!text && !slide.image) throw new Error(`slide ${index + 1} needs text or image`);
    return {
      text,
      image: cleanAssetPath(slide.image),
      background: cleanHex(slide.background, "#000000"),
      foreground: cleanHex(slide.foreground, "#f6edf0"),
      fit: slide.fit === "contain" ? "contain" : "cover",
      zoom: Boolean(slide.zoom)
    };
  });
  return { slides };
}

export function normalizeFaceManifest(candidate) {
  const source = Array.isArray(candidate) ? candidate : candidate?.images;
  if (!Array.isArray(source)) throw new Error("face manifest needs an images array");
  return { images:source.slice(0,128).map((image,index) => {
    const path=cleanAssetPath(image);
    if (!path || !/\.png$/i.test(path)) throw new Error(`face image ${index+1} must be a local PNG`);
    return path;
  }) };
}

export function validateMediaJson(kind, candidate) {
  if (kind === "slideshow") return normalizeSlideshowContent(candidate);
  if (kind === "face-manifest") return normalizeFaceManifest(candidate);
  throw new Error(`unknown JSON media kind: ${kind}`);
}

export function resolveMediaAssetUrl(assetPath, dataUrl, pageUrl) {
  const absoluteDataUrl = new URL(dataUrl || pageUrl, pageUrl);
  return new URL(assetPath, absoluteDataUrl).href;
}

export function resolveMediaAssetPath(assetPath, dataPath) {
  const manifestUrl = new URL(dataPath, "http://wetware.local/");
  const manifestFolder = new URL("./", manifestUrl).pathname;
  const resolved = new URL(assetPath, manifestUrl);
  if (resolved.origin !== manifestUrl.origin || !resolved.pathname.startsWith(manifestFolder)) {
    throw new Error("slide image must remain inside the manifest folder");
  }
  return decodeURIComponent(resolved.pathname);
}

function cleanText(value, limit) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, limit);
}

function cleanHex(value, fallback) {
  const color = String(value || "");
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

function cleanAssetPath(value) {
  if (!value) return null;
  const path = String(value).trim().slice(0, 300);
  if (/^(?:https?:|data:|blob:|javascript:|\/)/i.test(path) || path.includes("..")) throw new Error("slide image must be a local relative media path");
  return path;
}
