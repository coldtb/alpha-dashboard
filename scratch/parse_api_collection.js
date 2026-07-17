import fs from 'fs';

function main() {
  const path = 'C:/Users/hitech/.gemini/antigravity/brain/8ed4ba99-216e-4ac1-bddc-40059445a636/.system_generated/steps/13306/content.md';
  if (!fs.existsSync(path)) {
    console.log("File not found at path:", path);
    return;
  }
  const rawContent = fs.readFileSync(path, 'utf8');

  // Find where the JSON starts
  const jsonStartIdx = rawContent.indexOf('{');
  if (jsonStartIdx === -1) {
    console.log("No JSON object found in file.");
    return;
  }
  const jsonStr = rawContent.substring(jsonStartIdx);

  try {
    const data = JSON.parse(jsonStr);
    console.log("=== Parsing Postman Collection for Hibachi API ===");
    console.log(`Collection Name: ${data.info?.name}`);
    console.log(`Description: ${data.info?.description || 'None'}`);

    if (data.item) {
      printItems(data.item, 0);
    }
  } catch (e) {
    console.error("Failed to parse JSON:", e.message);
  }
}

function printItems(items, depth) {
  const indent = '  '.repeat(depth);
  items.forEach(item => {
    if (item.item) {
      console.log(`\n${indent}📂 Folder: ${item.name}`);
      printItems(item.item, depth + 1);
    } else {
      const req = item.request;
      const method = req?.method || 'GET';
      const url = typeof req?.url === 'string' ? req.url : (req?.url?.raw || '');
      console.log(`${indent}⚡ [${method}] ${item.name} -> ${url}`);
      if (req?.description) {
        console.log(`${indent}   Description: ${req.description.substring(0, 100)}...`);
      }
    }
  });
}

main();
