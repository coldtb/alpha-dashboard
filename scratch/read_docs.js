import fs from 'fs';

function cleanHtml(html) {
  // Simple HTML tag removal
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function main() {
  const path = 'C:\\Users\\hitech\\.gemini\\antigravity\\brain\\8ed4ba99-216e-4ac1-bddc-40059445a636\\.system_generated\\steps\\13262\\content.md';
  if (!fs.existsSync(path)) {
    console.log("File not found");
    return;
  }
  const content = fs.readFileSync(path, 'utf8');

  // Find all links (href="/something")
  const linkRegex = /href="([^"]+)"/g;
  const links = new Set();
  let match;
  while ((match = linkRegex.exec(content)) !== null) {
    links.add(match[1]);
  }

  console.log("=== Found Links in Hibachi Docs ===");
  Array.from(links).forEach(l => {
    if (l.includes('/') || l.includes('http')) {
      console.log(`- ${l}`);
    }
  });

  const text = cleanHtml(content);
  console.log("\n=== Clean Text Snippet (first 2000 chars) ===");
  console.log(text.substring(0, 2000));
}

main();
