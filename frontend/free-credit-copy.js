// Keep the free-credit promise consistent across the marketing and workspace
// surfaces. The server remains the source of truth for the actual grant.
const replacements = [
  ["20 free Forge credits", "40 free Forge credits"],
  ["20 free credits", "40 free credits"],
];

function updateFreeCreditCopy(root = document.body) {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let node;
  while ((node = walker.nextNode())) nodes.push(node);
  for (const textNode of nodes) {
    let value = textNode.nodeValue;
    for (const [from, to] of replacements) value = value.split(from).join(to);
    if (value !== textNode.nodeValue) textNode.nodeValue = value;
  }
}

updateFreeCreditCopy();
new MutationObserver(() => updateFreeCreditCopy()).observe(document.documentElement, { childList: true, subtree: true });
