const PAGE_REPRESENTATIONS = new Map([
  ["/", "/index.md"],
  ["/ko/", "/ko/index.md"],
  ["/practice-areas/", "/practice-areas/index.md"],
  ["/ko/practice-areas/", "/ko/practice-areas/index.md"],
  ["/legal-guides/", "/legal-guides/index.md"],
  ["/ko/legal-guides/", "/ko/legal-guides/index.md"],
  ["/guide-police", "/guide-police.md"],
  ["/ko/guide-police", "/ko/guide-police.md"],
  ["/guide-workplace", "/guide-workplace.md"],
  ["/ko/guide-workplace", "/ko/guide-workplace.md"],
  ["/guide-rent", "/guide-rent.md"],
  ["/ko/guide-rent", "/ko/guide-rent.md"],
  ["/guide-victim", "/guide-victim.md"],
  ["/ko/guide-victim", "/ko/guide-victim.md"],
  ["/guide-criminal-complaint", "/guide-criminal-complaint.md"],
  ["/ko/guide-criminal-complaint", "/ko/guide-criminal-complaint.md"],
  ["/guide-divorce", "/guide-divorce.md"],
  ["/ko/guide-divorce", "/ko/guide-divorce.md"],
  ["/guide-visa-overstay", "/guide-visa-overstay.md"],
  ["/ko/guide-visa-overstay", "/ko/guide-visa-overstay.md"],
]);

const MARKDOWN_TO_CANONICAL = new Map(
  [...PAGE_REPRESENTATIONS].map(([canonicalPath, markdownPath]) => [markdownPath, canonicalPath]),
);

function mediaQuality(accept, type) {
  let best = 0;
  for (const item of accept.split(",")) {
    const [mediaType, ...parameters] = item.trim().toLowerCase().split(";");
    const matches =
      mediaType === type ||
      mediaType === "*/*" ||
      (mediaType === "text/*" && type.startsWith("text/"));
    if (!matches) continue;

    const qualityParameter = parameters.find((parameter) => parameter.trim().startsWith("q="));
    const quality = qualityParameter ? Number(qualityParameter.trim().slice(2)) : 1;
    if (Number.isFinite(quality)) best = Math.max(best, quality);
  }
  return best;
}

function prefersMarkdown(request) {
  const accept = request.headers.get("Accept") || "*/*";
  const markdownQuality = mediaQuality(accept, "text/markdown");
  const htmlQuality = mediaQuality(accept, "text/html");
  return markdownQuality > 0 && markdownQuality > htmlQuality;
}

function appendVary(headers, value) {
  const values = new Set(
    (headers.get("Vary") || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
  values.add(value);
  headers.set("Vary", [...values].join(", "));
}

function pageLinks(origin, canonicalPath, markdownPath, markdownResponse) {
  const canonical = `${origin}${canonicalPath}`;
  if (markdownResponse) return `<${canonical}>; rel="canonical"`;
  return `<${canonical}>; rel="canonical", <${origin}${markdownPath}>; rel="alternate"; type="text/markdown"`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const canonicalPath = MARKDOWN_TO_CANONICAL.get(url.pathname) || url.pathname;
    const markdownPath = PAGE_REPRESENTATIONS.get(canonicalPath);
    const directMarkdown = MARKDOWN_TO_CANONICAL.has(url.pathname);
    const negotiatedMarkdown = Boolean(markdownPath && !directMarkdown && prefersMarkdown(request));

    let assetRequest = request;
    if (negotiatedMarkdown) {
      const markdownUrl = new URL(request.url);
      markdownUrl.pathname = markdownPath;
      assetRequest = new Request(markdownUrl, request);
    }

    const assetResponse = await env.ASSETS.fetch(assetRequest);
    const headers = new Headers(assetResponse.headers);
    headers.set("Content-Signal", "search=yes, ai-input=yes, ai-train=yes");

    if (url.pathname.startsWith("/assets/")) {
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
    }

    if (markdownPath) {
      const markdownResponse = directMarkdown || negotiatedMarkdown;
      headers.set("Link", pageLinks(url.origin, canonicalPath, markdownPath, markdownResponse));
      appendVary(headers, "Accept");

      if (markdownResponse) {
        headers.set("Content-Type", "text/markdown; charset=utf-8");
      }
      if (directMarkdown) {
        headers.set("X-Robots-Tag", "noindex, follow");
      }
    }

    return new Response(request.method === "HEAD" ? null : assetResponse.body, {
      status: assetResponse.status,
      statusText: assetResponse.statusText,
      headers,
    });
  },
};
