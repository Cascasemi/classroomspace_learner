/**
 * Interactive HTML Post-Processor
 *
 * Handles:
 * – LaTeX delimiter conversion ($$...$$ → \[...\], $...$ → \(...\))
 * – KaTeX CDN injection (CSS + JS + auto-render + MutationObserver)
 * – Script tag protection during LaTeX conversion
 *
 * Used when a generated scene contains interactive HTML content that
 * needs KaTeX rendered client-side (e.g. in an iframe or innerHTML block).
 */

/**
 * Main entry point: post-process generated interactive HTML.
 * Converts LaTeX delimiters and injects KaTeX rendering resources.
 */
export function postProcessInteractiveHtml(html: string): string {
  let processed = convertLatexDelimiters(html);

  // Only inject KaTeX if it's not already present
  if (!processed.toLowerCase().includes('katex')) {
    processed = injectKatex(processed);
  }

  return processed;
}

/**
 * Convert LaTeX delimiters while protecting <script> tags from modification.
 *
 * - Protects script blocks from substitution
 * - Converts display math: $$...$$ → \[...\]
 * - Converts inline math:  $...$  → \(...\)
 * - Restores script blocks
 */
export function convertLatexDelimiters(html: string): string {
  const scriptBlocks: string[] = [];

  // Replace all <script>...</script> blocks with numbered placeholders
  let processed = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, (match) => {
    scriptBlocks.push(match);
    return `__SCRIPT_BLOCK_${scriptBlocks.length - 1}__`;
  });

  // Display math: $$...$$ → \[...\]
  processed = processed.replace(/\$\$([^$]+)\$\$/g, '\\[$1\\]');

  // Inline math: $...$ → \(...\)
  // Non-greedy; excludes newlines to avoid false positives
  processed = processed.replace(/\$([^$\n]+?)\$/g, '\\($1\\)');

  // Restore script blocks via indexOf (not .replace) so $ inside scripts
  // is never misinterpreted as a substitution pattern.
  for (let i = 0; i < scriptBlocks.length; i++) {
    const placeholder = `__SCRIPT_BLOCK_${i}__`;
    const idx = processed.indexOf(placeholder);
    if (idx !== -1) {
      processed =
        processed.substring(0, idx) +
        scriptBlocks[i] +
        processed.substring(idx + placeholder.length);
    }
  }

  return processed;
}

/**
 * Inject KaTeX CSS, JS, auto-render extension, and a MutationObserver before
 * </head>. Falls back to appending at the document end if </head> is absent.
 */
export function injectKatex(html: string): string {
  const katexVersion = '0.16.9';
  const cdnBase = `https://cdn.jsdelivr.net/npm/katex@${katexVersion}/dist`;

  const injection = `
<link rel="stylesheet" href="${cdnBase}/katex.min.css" crossorigin="anonymous">
<script defer src="${cdnBase}/katex.min.js" crossorigin="anonymous"></script>
<script defer src="${cdnBase}/contrib/auto-render.min.js" crossorigin="anonymous"></script>
<script>
document.addEventListener("DOMContentLoaded", function () {
  function renderMath(root) {
    renderMathInElement(root, {
      delimiters: [
        { left: "\\\\[", right: "\\\\]", display: true },
        { left: "\\\\(", right: "\\\\)", display: false }
      ],
      throwOnError: false
    });
  }
  renderMath(document.body);
  // Re-render dynamically inserted content
  new MutationObserver(function (mutations) {
    mutations.forEach(function (m) {
      m.addedNodes.forEach(function (n) {
        if (n.nodeType === 1) renderMath(n);
      });
    });
  }).observe(document.body, { childList: true, subtree: true });
});
</script>`.trim();

  const closeHeadIdx = html.toLowerCase().indexOf('</head>');
  if (closeHeadIdx !== -1) {
    return html.slice(0, closeHeadIdx) + injection + '\n' + html.slice(closeHeadIdx);
  }
  return html + '\n' + injection;
}
