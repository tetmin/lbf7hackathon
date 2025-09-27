// Simple proxy server for KEGG API (run if CORS issues occur)
// Usage: node proxy-server.js
// Then update KeggPathwayViewer.jsx to use localhost:3001 URLs

import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();

// Enable CORS for all origins
app.use(cors());

app.get("/api/kegg/:id/kgml", async (req, res) => {
  try {
    const id = req.params.id;
    console.log(`Fetching KGML for ${id}`);
    const response = await fetch(`https://rest.kegg.jp/get/${id}/kgml`);
    const text = await response.text();
    res.set("Content-Type", "application/xml");
    res.send(text);
  } catch (error) {
    console.error("Error fetching KGML:", error);
    res.status(500).json({ error: "Failed to fetch KGML" });
  }
});

app.get("/api/kegg/:id/image", async (req, res) => {
  try {
    const id = req.params.id;
    console.log(`Fetching image for ${id}`);
    const response = await fetch(`https://rest.kegg.jp/get/${id}/image`);
    const buffer = await response.arrayBuffer();
    res.set("Content-Type", "image/png");
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error("Error fetching image:", error);
    res.status(500).json({ error: "Failed to fetch image" });
  }
});

app.get("/api/kegg/genes/:geneIds", async (req, res) => {
  try {
    const geneIds = req.params.geneIds;
    console.log(`Fetching bulk gene info for ${geneIds.split(',').length} genes`);
    
    // KEGG REST API: get gene information in bulk
    // Format: https://rest.kegg.jp/get/hsa:5604+hsa:5605+hsa:5728+...
    const keggIds = geneIds.replace(/,/g, '+'); // Convert comma-separated to plus-separated
    const response = await fetch(`https://rest.kegg.jp/get/${keggIds}`);
    const text = await response.text();
    
    res.set("Content-Type", "text/plain");
    res.send(text);
  } catch (error) {
    console.error("Error fetching bulk gene info:", error);
    res.status(500).json({ error: "Failed to fetch bulk gene info" });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`KEGG proxy server running on http://localhost:${PORT}`);
  console.log("Endpoints:");
  console.log(`  GET /api/kegg/{pathway-id}/kgml`);
  console.log(`  GET /api/kegg/{pathway-id}/image`);
});

