import fs from "fs";
import path from "path";

export default async function handler(req, res) {
  try {
    const configPath = path.join(process.cwd(), "config.json");
    if (fs.existsSync(configPath)) {
      const rawConfig = fs.readFileSync(configPath, "utf8");
      return res.status(200).json(JSON.parse(rawConfig));
    } else {
      return res.status(404).json({ error: "Config file not found" });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
