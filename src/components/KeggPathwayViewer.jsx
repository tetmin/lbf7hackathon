import React, { useEffect, useMemo, useRef, useState } from "react";
import cytoscape from "cytoscape";
import popper from "cytoscape-popper";

cytoscape.use(popper);

const KEGG_KGML = (id) => `/api/kegg/${id}/kgml`;
const KEGG_BULK_GENES = (geneIdList) => `/api/kegg/genes/${geneIdList.join(',')}`;

// Cache for gene name lookups to avoid repeated API calls
const geneNameCache = new Map();

// Helper function to extract comprehensive biological data from KEGG gene entry
function parseKeggGeneEntry(geneEntry, geneId, fallbackName) {
  const data = {
    symbol: fallbackName,
    synonyms: [],
    fullName: '',
    uniprotId: '',
    ncbiGeneId: '',
    omimId: '',
    hgncId: '',
    ensemblId: '',
    orthology: '',
    ecNumber: '',
    pathways: [],
    diseases: [],
    drugs: [],
    chromosomePosition: ''
  };
  
  // Parse SYMBOL field and extract all synonyms
  const symbolMatch = geneEntry.match(/^SYMBOL\s+(.+)$/m);
  if (symbolMatch) {
    const symbols = symbolMatch[1].split(/[,;]/).map(s => s.trim());
    if (symbols.length > 0) {
      data.symbol = symbols[0]; // Use first symbol from KEGG API
      data.synonyms = symbols; // Store all synonyms
    }
  }
  
  // Parse NAME field  
  const nameMatch = geneEntry.match(/^NAME\s+(.+)$/m);
  if (nameMatch) {
    data.fullName = nameMatch[1].replace(/^\(RefSeq\)\s*/, '').trim();
  }
  
  // Parse ORTHOLOGY (includes EC number)
  const orthologyMatch = geneEntry.match(/^ORTHOLOGY\s+(.+)$/m);
  if (orthologyMatch) {
    data.orthology = orthologyMatch[1];
    const ecMatch = orthologyMatch[1].match(/\[EC:([\d\.]+)\]/);
    if (ecMatch) {
      data.ecNumber = ecMatch[1];
    }
  }
  
  // Parse DBLINKS section for external database IDs
  const dblinksSectionMatch = geneEntry.match(/^DBLINKS\s+([\s\S]*?)^[A-Z]/m);
  if (dblinksSectionMatch) {
    const dblinks = dblinksSectionMatch[1];
    
    // Extract UniProt ID (most important for user!)
    const uniprotMatch = dblinks.match(/UniProt:\s+([A-Z0-9]+)/);
    if (uniprotMatch) {
      data.uniprotId = uniprotMatch[1];
    }
    
    // Extract other database IDs
    const ncbiMatch = dblinks.match(/NCBI-GeneID:\s+(\d+)/);
    if (ncbiMatch) data.ncbiGeneId = ncbiMatch[1];
    
    const omimMatch = dblinks.match(/OMIM:\s+(\d+)/);
    if (omimMatch) data.omimId = omimMatch[1];
    
    const hgncMatch = dblinks.match(/HGNC:\s+(\d+)/);
    if (hgncMatch) data.hgncId = hgncMatch[1];
    
    const ensemblMatch = dblinks.match(/Ensembl:\s+([A-Z0-9]+)/);
    if (ensemblMatch) data.ensemblId = ensemblMatch[1];
  }
  
  // Parse PATHWAY section
  const pathwayMatches = geneEntry.match(/^\s+hsa\d+\s+(.+)$/gm);
  if (pathwayMatches) {
    data.pathways = pathwayMatches.map(match => 
      match.trim().replace(/^hsa\d+\s+/, '')
    ).slice(0, 10); // Limit to first 10 pathways
  }
  
  // Parse DISEASE section
  const diseaseSectionMatch = geneEntry.match(/^DISEASE\s+([\s\S]*?)^[A-Z]/m);
  if (diseaseSectionMatch) {
    const diseaseMatches = diseaseSectionMatch[1].match(/H\d+\s+(.+)/g);
    if (diseaseMatches) {
      data.diseases = diseaseMatches.map(match => 
        match.replace(/H\d+\s+/, '').trim()
      );
    }
  }
  
  // Parse DRUG_TARGET section
  const drugSectionMatch = geneEntry.match(/^DRUG_TARGET\s+([\s\S]*?)^[A-Z]/m);
  if (drugSectionMatch) {
    const drugMatches = drugSectionMatch[1].match(/([^:]+):/g);
    if (drugMatches) {
      data.drugs = drugMatches.map(match => 
        match.replace(':', '').trim()
      );
    }
  }
  
  // Parse POSITION (chromosomal location)
  const positionMatch = geneEntry.match(/^POSITION\s+(.+)$/m);
  if (positionMatch) {
    data.chromosomePosition = positionMatch[1];
  }
  
  return data;
}

// Bulk function to get standardized gene names from KEGG REST API
async function getBulkStandardizedGeneNames(geneNodes, entries) {
  
  // Collect all unique gene IDs from the pathway
  const uniqueGeneIds = new Set();
  const geneIdToNodeMap = new Map();
  
  geneNodes.forEach(node => {
    const keggId = node.data('keggId');
    if (!keggId) return;
    
    // Extract individual gene IDs (e.g., "hsa:5604 hsa:5605" -> ["hsa:5604", "hsa:5605"])
    const geneIds = keggId.split(/\s+/).filter(id => id.includes(':') && id.startsWith('hsa:') && id.match(/^hsa:\d+$/));
    if (geneIds.length === 0) return;
    
    // Add ALL gene IDs to fetch, not just the primary one
    geneIds.forEach(geneId => {
      // Skip if already cached
      if (geneNameCache.has(geneId)) {
        return;
      }
      
      uniqueGeneIds.add(geneId);
      geneIdToNodeMap.set(geneId, {
        node,
        fallbackName: node.data('label')
      });
    });
  });
  
  if (uniqueGeneIds.size === 0) {
    console.log("No new genes to fetch - all cached");
    return;
  }
  
  const geneIdList = Array.from(uniqueGeneIds);
  console.log(`Fetching ${geneIdList.length} genes in bulk from KEGG API`);
  
  try {
    // Make bulk API call
    const apiUrl = KEGG_BULK_GENES(geneIdList);
    console.log(`API URL: ${apiUrl}`);
    
    const response = await fetch(apiUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const bulkData = await response.text();
    console.log(`Bulk API response length: ${bulkData.length} characters`);
    console.log(`First 500 chars of response:`, bulkData.substring(0, 500));
    
    if (bulkData.length === 0) {
      console.error("Empty response from bulk API!");
      return;
    }
    
    if (!bulkData.includes('ENTRY')) {
      console.error("No ENTRY found in response:", bulkData);
      return;
    }
    
    // Split bulk response into individual gene entries
    // KEGG returns multiple entries separated by "///"
    const geneEntries = bulkData.split(/\n\/\/\/\n|\n\/\/\/$/);
    console.log(`Split into ${geneEntries.length} gene entries`);
    
    let updatedCount = 0;
    
    // Process each gene entry
    geneEntries.forEach((geneEntry, index) => {
      if (!geneEntry.trim()) {
        console.log(`Skipping empty gene entry ${index}`);
        return;
      }
      
      // Extract gene ID from the entry
      const entryMatch = geneEntry.match(/^ENTRY\s+(\d+)/m);
      if (!entryMatch) return;
      
      const geneNumber = entryMatch[1];
      const fullGeneId = `hsa:${geneNumber}`;
      
      const nodeInfo = geneIdToNodeMap.get(fullGeneId);
      if (!nodeInfo) {
        // Gene might not be linked to a node if it's a secondary gene in a multi-gene entry
        // But we still want to cache the data for popup display
        const geneData = parseKeggGeneEntry(geneEntry, fullGeneId, fullGeneId);
        geneNameCache.set(fullGeneId, geneData);
        console.log(`Cached secondary gene: ${fullGeneId} -> "${geneData.symbol}"`);
        return;
      }
      
      // Parse the gene entry to get comprehensive biological data
      const geneData = parseKeggGeneEntry(geneEntry, fullGeneId, nodeInfo.fallbackName);
      
      // Cache the result
      geneNameCache.set(fullGeneId, geneData);
      
      // Check if this is the primary gene for this node (first gene ID in the keggId string)
      const nodeKeggId = nodeInfo.node.data('keggId');
      const primaryGeneId = nodeKeggId ? nodeKeggId.split(/\s+/)[0] : '';
      const isPrimaryGene = fullGeneId === primaryGeneId;
      
      if (isPrimaryGene) {
        // Only update node display for the primary gene
        nodeInfo.node.data('geneData', geneData);
        entries[nodeInfo.node.id()].geneData = geneData;
        
        if (geneData.symbol !== nodeInfo.fallbackName) {
          // Update the node label
          nodeInfo.node.data('label', geneData.symbol);
          nodeInfo.node.data('name', geneData.symbol);
          
          // Update entries cache
          entries[nodeInfo.node.id()].name = geneData.symbol;
          
          console.log(`Updated primary gene: ${fullGeneId} -> "${geneData.symbol}"`);
          updatedCount++;
        }
      } else {
        console.log(`Cached secondary gene: ${fullGeneId} -> "${geneData.symbol}"`);
      }
    });
    
    console.log(`Updated ${updatedCount} gene names from bulk KEGG API response`);
    
  } catch (error) {
    console.error("Failed to fetch bulk gene info:", error);
    
    // Cache fallbacks for failed genes
    geneIdList.forEach(geneId => {
      const nodeInfo = geneIdToNodeMap.get(geneId);
      if (nodeInfo) {
        geneNameCache.set(geneId, nodeInfo.fallbackName);
      }
    });
  }
}

// Fallback function to extract name from graphics (used while API is loading)
function extractFallbackGeneName(graphicsName, entryType) {
  if (!graphicsName) return "";
  
  if (entryType === "map") {
    // Clean up map names - remove "TITLE:" prefix and truncate long names
    return graphicsName.replace(/^TITLE:\s*/, "").replace(/\s+pathway$/, "");
  }
  if (entryType === "compound") return graphicsName;
  
  if (entryType === "gene" || entryType === "ortholog") {
    const cleanName = graphicsName.replace(/^TITLE:/, "").replace(/\.\.\.$/, "").trim();
    const parts = cleanName.split(/[,;]/).map(p => p.trim());
    
    // Quick fallback: find shortest reasonable name
    const shortNames = parts.filter(part => 
      part.length >= 3 && part.length <= 8 && /^[A-Za-z][\w]*$/.test(part)
    );
    
    return shortNames.length > 0 ? shortNames[0] : parts[0] || cleanName;
  }
  
  return graphicsName;
}

// Generate labels for group/complex entries (data-driven only)
function getGroupLabel(groupId, componentIds) {
  // Use generic labels only - no hardcoded biological knowledge
  return componentIds.length > 1 ? "Complex" : "Group";
}

function parseKgmlToCyElements(xmlStr) {
  const doc = new DOMParser().parseFromString(xmlStr, "text/xml");
  const mapW = parseInt(doc.documentElement.getAttribute("width") || "1200", 10);
  const mapH = parseInt(doc.documentElement.getAttribute("height") || "800", 10);

  const entries = {};
  const nodes = [];
  const groups = new Map(); // Track group entries and their components
  
  doc.querySelectorAll("entry").forEach((e) => {
    const id = e.getAttribute("id");
    const type = e.getAttribute("type") || "";
    const name = e.getAttribute("name") || "";
    const g = e.querySelector("graphics");
    
    let x = 0, y = 0, w = 60, h = 20, rawLabel = name, displayLabel = name;
    let bgcolor = "#FFFFFF", fgcolor = "#000000", shape = "rectangle";
    
    if (g) {
      x = Math.round(parseFloat(g.getAttribute("x") || "0"));
      y = Math.round(parseFloat(g.getAttribute("y") || "0"));
      w = Math.round(parseFloat(g.getAttribute("width") || "60"));
      h = Math.round(parseFloat(g.getAttribute("height") || "20"));
      rawLabel = g.getAttribute("name") || name;
      bgcolor = g.getAttribute("bgcolor") || bgcolor;
      fgcolor = g.getAttribute("fgcolor") || fgcolor;
      shape = g.getAttribute("type") || shape;
    }
    
    // Handle group entries
    if (type === "group") {
      const components = Array.from(e.querySelectorAll("component")).map(c => c.getAttribute("id"));
      groups.set(id, components);
      
      // Create a compound node for the group
      displayLabel = getGroupLabel(id, components); // Smart label for groups
      bgcolor = "#E0E0E0"; // Grey background for complexes
      
      entries[id] = { 
        x, y, w, h, type, 
        name: displayLabel, 
        rawName: rawLabel,
        keggId: name,
        bgcolor, fgcolor, shape,
        components: components
      };

      nodes.push({
        data: { 
          id, 
          label: displayLabel, 
          rawLabel: rawLabel,
          keggId: name,
          type, 
          name: displayLabel, 
          bgcolor, fgcolor, shape,
          components: components
        },
        position: { x, y },
        classes: `${type} compound`,
      });
    } else {
      // Extract fallback display name (will be updated via API)
      displayLabel = extractFallbackGeneName(rawLabel, type);
      
      entries[id] = { 
        x, y, w, h, type, 
        name: displayLabel, 
        rawName: rawLabel,
        keggId: name,
        bgcolor, fgcolor, shape 
      };

      nodes.push({
        data: { 
          id, 
          label: displayLabel, 
          rawLabel: rawLabel,
          keggId: name,
          type, 
          name: displayLabel, 
          bgcolor, fgcolor, shape 
        },
        position: { x, y },
        classes: type,
      });
    }
  });

  const edges = [];
  doc.querySelectorAll("relation").forEach((r, i) => {
    const source = r.getAttribute("entry1");
    const target = r.getAttribute("entry2");
    const relType = r.getAttribute("type") || "PPrel";
    
    // Get all subtypes for this relation
    let subtype = "interaction";
    let arrowStyle = "triangle";
    let isInhibition = false;
    let edgeLabel = "";
    let lineStyle = "solid";
    const modifications = [];
    
    const subtypes = r.querySelectorAll("subtype");
    subtypes.forEach(st => {
      const name = st.getAttribute("name") || "";
      const value = st.getAttribute("value") || "";
      
      if (name.includes("inhibition")) {
        isInhibition = true;
        arrowStyle = "tee";
      } else if (name.includes("activation")) {
        arrowStyle = "triangle";
      } else if (name.includes("binding")) {
        arrowStyle = "none";
        lineStyle = "dashed";
      } else if (name.includes("indirect")) {
        lineStyle = "dotted";
      } else if (name.includes("phosphorylation")) {
        modifications.push("+p");
      } else if (name.includes("ubiquitination")) {
        modifications.push("+u");
      } else if (name.includes("methylation")) {
        modifications.push("+m");
      } else if (name.includes("glycosylation")) {
        modifications.push("+g");
      } else if (name.includes("dephosphorylation")) {
        modifications.push("-p");
      }
      
      if (!subtype || subtype === "interaction") {
        subtype = name;
      }
    });

    // Create edge label from modifications
    if (modifications.length > 0) {
      edgeLabel = modifications.join(" ");
    }

    const id = r.getAttribute("id") || `${source}_${target}_${i}`;
    edges.push({
      data: { 
        id, source, target, subtype, relType, 
        arrowStyle, isInhibition, edgeLabel, lineStyle,
        modifications: modifications
      }
    });
  });

  return { nodes, edges, mapW, mapH, entries };
}

// Simple diverging color without extra deps (-1 → red, 0 → grey, +1 → blue)
function divergingColor(v) {
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const t = clamp((v + 1) / 2, 0, 1); // 0..1
  const r = Math.round(127 + (255 - 127) * (1 - t));  // red high when v=-1
  const g = Math.round(127 + (127 - 127) * (1 - Math.abs(v))); // stay mid
  const b = Math.round(127 + (255 - 127) * t);        // blue high when v=+1
  return `rgb(${r},${g},${b})`;
}

export default function KeggPathwayViewer({
  pathwayId = "hsa04150",
  // overlay: map from "sourceId|targetId" OR "entry1,entry2" to [-1..+1] score
  edgeOverlay = {},
  showNodeLabels = true
}) {
  const cyRef = useRef(null);
  const containerRef = useRef(null);
  const [status, setStatus] = useState("Loading KGML…");
  const [sideInfo, setSideInfo] = useState(null);
  const [mapDims, setMapDims] = useState({ w: 1200, h: 1200 });

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        setStatus("Fetching KGML…");
        // If CORS blocks in your environment, proxy this URL via a tiny Node/Express server
        const res = await fetch(KEGG_KGML(pathwayId));
        const xml = await res.text();
        const { nodes, edges, mapW, mapH, entries } = parseKgmlToCyElements(xml);
        if (cancelled) return;

        setMapDims({ w: mapW, h: mapH });

        // Build Cytoscape instance
        const cy = cytoscape({
          container: containerRef.current,
          elements: [...nodes, ...edges],
          wheelSensitivity: 0.2,
          motionBlur: false,
          textureOnViewport: true,
          boxSelectionEnabled: true,
          style: [
            // Base nodes: render exactly as defined in KGML
            {
              selector: "node",
              style: {
                "shape": (ele) => {
                  const shape = entries[ele.id()]?.shape || "rectangle";
                  if (shape === "roundrectangle") return "round-rectangle";
                  if (shape === "circle") return "ellipse";
                  return "rectangle";
                },
                "width": (ele) => entries[ele.id()]?.w || 60,
                "height": (ele) => entries[ele.id()]?.h || 20,
                "background-color": (ele) => entries[ele.id()]?.bgcolor || "#FFFFFF",
                "background-opacity": 1,           // Fully opaque nodes
                "border-width": 1,
                "border-color": (ele) => entries[ele.id()]?.fgcolor || "#000000",
                "label": showNodeLabels ? "data(label)" : "",
                "font-size": 10,
                "text-wrap": "wrap",
                "text-max-width": (ele) => (entries[ele.id()]?.w || 60) - 4,
                "text-valign": "center",
                "text-halign": "center",
                "color": (ele) => entries[ele.id()]?.fgcolor || "#000000",
                "font-weight": "normal"
              }
            },
            // Gene nodes: light green background
            {
              selector: "node[type='gene']",
              style: {
                "background-color": "#BFFFBF",
                "font-size": 9
              }
            },
            // Compound nodes: white background, circular
            {
              selector: "node[type='compound']",
              style: {
                "background-color": "#FFFFFF",
                "shape": "ellipse"
              }
            },
            // Map nodes: white background, rounded rectangles for external pathways
            {
              selector: "node[type='map']",
              style: {
                "background-color": "#FFFFFF",
                "border-color": "#666",
                "border-width": 1,
                "shape": "round-rectangle",
                "font-size": 9,
                "font-weight": "bold",
                "text-valign": "center",
                "text-halign": "center",
                "text-wrap": "wrap",
                "text-max-width": (ele) => (entries[ele.id()]?.w || 90) - 6,
                "color": "#333"
              }
            },
            // Title map node (pathway title): larger, different styling  
            {
              selector: "node[name='path:hsa04150']",
              style: {
                "background-color": "#F0F8FF",
                "border-color": "#4682B4",
                "border-width": 2,
                "font-size": 12,
                "font-weight": "bold",
                "color": "#000080"
              }
            },
            // Group/Complex nodes: grey background, larger
            {
              selector: "node[type='group']",
              style: {
                "background-color": "#E0E0E0",
                "border-color": "#888",
                "border-width": 2,
                "shape": "round-rectangle",
                "font-size": 10,
                "font-weight": "bold",
                "text-valign": "center",
                "text-halign": "center"
              }
            },
            // Edges: use KGML relation types + optional overlay
            {
              selector: "edge",
              style: {
                "curve-style": "straight",
                "width": (ele) => {
                  const k = `${ele.data("source")}|${ele.data("target")}`;
                  const v = edgeOverlay[k];
                  const base = 2;
                  if (v === undefined || v === null) return base;
                  return base + 3 * Math.min(1, Math.abs(v));
                },
                "line-color": (ele) => {
                  const k = `${ele.data("source")}|${ele.data("target")}`;
                  const v = edgeOverlay[k];
                  return v === undefined ? "#666" : divergingColor(v);
                },
                "line-style": (ele) => ele.data("lineStyle") || "solid",
                "target-arrow-shape": (ele) => ele.data("arrowStyle") || "triangle",
                "target-arrow-color": (ele) => {
                  const k = `${ele.data("source")}|${ele.data("target")}`;
                  const v = edgeOverlay[k];
                  return v === undefined ? "#666" : divergingColor(v);
                },
                "source-arrow-shape": "none",
                "label": (ele) => ele.data("edgeLabel") || "",
                "font-size": "10px",
                "text-background-color": "#FFFFFF",
                "text-background-opacity": 0.8,
                "text-background-padding": "2px",
                "text-border-width": 1,
                "text-border-color": "#CCC",
                "text-border-opacity": 0.8,
                "color": "#333"
              }
            },
            // Inhibition edges: red/tee style
            {
              selector: "edge[isInhibition='true']",
              style: {
                "line-color": "#cc0000",
                "target-arrow-color": "#cc0000",
                "target-arrow-shape": "tee"
              }
            },
            // Activation edges: blue/triangle style  
            {
              selector: "edge[subtype*='activation']",
              style: {
                "line-color": "#0066cc",
                "target-arrow-color": "#0066cc",
                "target-arrow-shape": "triangle"
              }
            },
            // Binding edges: dashed lines, no arrow
            {
              selector: "edge[subtype*='binding']",
              style: {
                "line-color": "#999",
                "line-style": "dashed",
                "target-arrow-shape": "none"
              }
            },
            // Dotted edges for indirect interactions
            {
              selector: "edge[lineStyle='dotted']",
              style: {
                "line-style": "dotted",
                "line-color": "#888"
              }
            },
            // Dashed edges for binding/association
            {
              selector: "edge[lineStyle='dashed']",
              style: {
                "line-style": "dashed",
                "line-color": "#777"
              }
            },
            // Highlight on hover/click
            {
              selector: "node:selected, edge:selected",
              style: { 
                "border-color": "#ff6600", 
                "border-width": 3,
                "line-color": "#ff6600", 
                "target-arrow-color": "#ff6600",
                "z-index": 999
              }
            }
          ],
          layout: {
            name: "preset",      // use given positions
            fit: false,
          }
        });

        // Set positions explicitly
        cy.nodes().positions((n) => {
          const e = entries[n.id()];
          return { x: e.x, y: e.y };
        });

        // Clean white background for rendered pathway
        containerRef.current.style.backgroundImage = "none";
        containerRef.current.style.backgroundColor = "#ffffff";

        // Hover tooltip with Popper
        const makeTooltip = (ele) => {
          const ref = ele.popperRef();
          const t = document.createElement("div");
          t.className = "tooltip bubble";
          const data = entries[ele.id()];
          const rawLabel = ele.data("rawLabel");
          const keggId = ele.data("keggId");
          const nodeType = ele.data("type");
          const components = ele.data("components");
          const geneData = ele.data("geneData");
          
          let tooltipContent = `
            <div style="font-weight:600;margin-bottom:6px;color:#2563eb">${data?.name || ele.id()}</div>
          `;
          
          if (nodeType === "gene" && geneData) {
            // Enhanced tooltip for genes with biological data
            if (geneData.fullName) {
              tooltipContent += `<div style="font-size:11px;color:#374151;margin-bottom:3px;font-style:italic">${geneData.fullName}</div>`;
            }
            if (geneData.synonyms && geneData.synonyms.length > 1) {
              tooltipContent += `<div style="font-size:10px;color:#6b7280;margin-bottom:2px"><strong>Synonyms:</strong> ${geneData.synonyms.slice(1, 4).join(', ')}${geneData.synonyms.length > 4 ? '...' : ''}</div>`;
            }
            if (geneData.uniprotId) {
              tooltipContent += `<div style="font-size:10px;color:#059669;margin-bottom:2px"><strong>UniProt:</strong> <a href="https://www.uniprot.org/uniprot/${geneData.uniprotId}" target="_blank" style="color:#059669;">${geneData.uniprotId}</a></div>`;
            }
            if (geneData.chromosomePosition) {
              tooltipContent += `<div style="font-size:10px;color:#7c3aed;margin-bottom:2px"><strong>Location:</strong> ${geneData.chromosomePosition.replace(/complement\(|[()]/g, '')}</div>`;
            }
            if (geneData.drugs && geneData.drugs.length > 0) {
              tooltipContent += `<div style="font-size:10px;color:#dc2626;margin-bottom:2px"><strong>Drugs:</strong> ${geneData.drugs.slice(0, 2).join(', ')}${geneData.drugs.length > 2 ? '...' : ''}</div>`;
            }
          } else if (nodeType === "group" && components && components.length > 0) {
            tooltipContent += `<div style="font-size:11px;color:#666;margin-bottom:2px">Complex with ${components.length} components</div>`;
          } else if (rawLabel && rawLabel !== data?.name) {
            tooltipContent += `<div style="font-size:11px;color:#666;margin-bottom:2px">${rawLabel}</div>`;
          }
          
          tooltipContent += `<div style="font-size:10px;color:#6b7280;margin-top:4px">Click for details</div>`;
          
          t.innerHTML = tooltipContent;
          t.style.cssText = `
            background: white; border: 1px solid #e5e7eb; border-radius: 8px; 
            padding: 8px 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.15);
            font-family: system-ui, -apple-system, sans-serif; max-width: 300px;
            font-size: 12px; line-height: 1.4; z-index: 1000;
          `;
          document.body.appendChild(t);
          const tip = ele.popper({
            content: () => t,
            popper: { placement: "top", removeOnDestroy: true }
          });
          ele.on("mouseout", () => { tip.destroy(); t.remove(); });
        };

        cy.on("mouseover", "node", (evt) => makeTooltip(evt.target));

        // Click → open side panel
        cy.on("tap", "node", (evt) => {
          const n = evt.target;
          const e = entries[n.id()];
          const nodeType = n.data("type");
          
          // Parse multiple gene IDs if present
          let multipleGenes = [];
          if (nodeType === "gene" && n.data("keggId")) {
            const geneIds = n.data("keggId").split(/\s+/).filter(id => id.startsWith('hsa:'));
            
            if (geneIds.length > 1) {
              // Multiple genes - collect data for each
              multipleGenes = geneIds.map(geneId => {
                const cachedData = geneNameCache.get(geneId);
                return {
                  keggId: geneId,
                  geneData: cachedData || null
                };
              });
            }
          }
          
          const sideInfoData = {
            id: n.id(),
            label: e?.name || n.data("label"),
            rawLabel: n.data("rawLabel"),
            keggId: n.data("keggId"),
            type: nodeType || "",
            components: n.data("components"),
            geneData: n.data("geneData"),
            multipleGenes: multipleGenes,
            x: e?.x, y: e?.y, w: e?.w, h: e?.h
          };
          
          setSideInfo(sideInfoData);
        });

        // Fit and position optimally - minimize top whitespace
        cy.resize();
        
        // Get bounding box of all nodes
        const bb = cy.nodes().boundingBox();
        const containerHeight = containerRef.current.clientHeight;
        const containerWidth = containerRef.current.clientWidth;
        
        // Calculate optimal zoom to fit content with minimal top padding
        const contentWidth = bb.w;
        const contentHeight = bb.h;
        const paddingTop = 10; // Very minimal top padding
        const paddingHorizontal = 20; // Side padding
        const paddingBottom = 30; // Bottom padding
        
        // Calculate zoom levels for width and height constraints
        const zoomForWidth = (containerWidth - 2 * paddingHorizontal) / contentWidth;
        const zoomForHeight = (containerHeight - paddingTop - paddingBottom) / contentHeight;
        
        // Use the smaller zoom to ensure everything fits
        const optimalZoom = Math.min(zoomForWidth, zoomForHeight, 1.0); // Cap at 1.0 max zoom
        
        // Apply zoom first
        cy.zoom(optimalZoom);
        
        // Calculate position to place content at top with minimal padding
        // Convert container coordinates to cytoscape coordinates
        const renderedBB = cy.nodes().renderedBoundingBox();
        
        // Calculate how much we need to pan to position top of content near container top
        const targetTopY = paddingTop; // Where we want the top to be in container pixels
        const currentTopY = renderedBB.y1; // Where the top currently is in container pixels
        const panAdjustmentY = targetTopY - currentTopY;
        
        // Center horizontally but position at top
        const containerCenterX = containerWidth / 2;
        const renderedCenterX = renderedBB.x1 + (renderedBB.w / 2);
        const panAdjustmentX = containerCenterX - renderedCenterX;
        
        // Apply the positioning
        const currentPan = cy.pan();
        cy.pan({
          x: currentPan.x + panAdjustmentX,
          y: currentPan.y + panAdjustmentY
        });

        cyRef.current = cy;
        setStatus("");

        // Phase 2: Fetch standardized gene names from KEGG API (bulk)
        setTimeout(async () => {
          if (cancelled) return;
          
          setStatus("Fetching gene names...");
          
          const geneNodes = cy.nodes().filter(node => node.data('type') === 'gene');
          
          if (geneNodes.length === 0) {
            setStatus("");
            return;
          }
          
          try {
            // Use bulk API call instead of individual calls
            await getBulkStandardizedGeneNames(geneNodes, entries);
            
            if (!cancelled) {
              setStatus("");
            }
          } catch (error) {
            console.error("Failed to fetch bulk gene names:", error);
            if (!cancelled) {
              setStatus("");
            }
          }
        }, 100); // Small delay to let initial render complete
      } catch (err) {
        setStatus("Failed to load KGML. (CORS? Try the proxy below.)");
        console.error(err);
      }
    }
    run();
    return () => { cancelled = true; cyRef.current?.destroy(); };
  }, [pathwayId, showNodeLabels, edgeOverlay]);

  return (
    <div className="w-full">
      <div className="flex gap-3 items-center mb-4">
        <div className="text-sm text-gray-600 font-medium">Pathway: {pathwayId}</div>
        {status && <div className="text-sm text-amber-700 font-medium">{status}</div>}
      </div>

      {/* Cytoscape viewport sized exactly to KEGG map dimensions */}
      <div className="flex justify-center overflow-auto">
        <div
          ref={containerRef}
          style={{
            width: mapDims.w,
            height: mapDims.h,
            border: "2px solid #ddd",
            borderRadius: 8,
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            overflow: "hidden",
            backgroundColor: "#ffffff"
          }}
        />
      </div>

      {/* Side panel */}
      {sideInfo && (
        <div className="fixed right-6 top-24 w-96 max-h-[calc(100vh-120px)] bg-white border border-gray-200 rounded-xl p-6 shadow-xl z-50 overflow-y-auto">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900">{sideInfo.label}</h3>
            <button 
              onClick={() => setSideInfo(null)}
              className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            >
              ×
            </button>
          </div>
          <div className="space-y-3 text-sm">
            <div>
              <span className="font-medium text-gray-700">Type:</span> 
              <span className="ml-2 px-2 py-1 bg-gray-100 rounded text-xs">{sideInfo.type || "-"}</span>
            </div>
            
            {sideInfo.type === "gene" && (sideInfo.multipleGenes?.length > 0 || sideInfo.geneData) ? (
              <div className="space-y-4">
                {/* Handle Multiple Genes */}
                {sideInfo.multipleGenes && sideInfo.multipleGenes.length > 1 ? (
                  <div>
                    <div className="mb-3 p-2 bg-blue-50 rounded-lg border border-blue-200">
                      <span className="font-medium text-blue-800">Multiple Genes ({sideInfo.multipleGenes.length})</span>
                      <div className="text-xs text-blue-600 mt-1">This complex contains {sideInfo.multipleGenes.length} different genes</div>
                    </div>
                    
                    {sideInfo.multipleGenes.map((gene, index) => (
                      <div key={gene.keggId} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                        <div className="flex justify-between items-center mb-2">
                          <h4 className="font-medium text-gray-900">Gene {index + 1}</h4>
                          <a href={`https://www.kegg.jp/entry/${gene.keggId}`} 
                             target="_blank" rel="noopener noreferrer" 
                             className="text-xs font-mono text-blue-600 hover:underline bg-blue-100 px-2 py-1 rounded">
                            {gene.keggId}
                          </a>
                        </div>
                        
                        {gene.geneData ? (
                          <div className="space-y-2">
                            {/* Gene Description */}
                            {gene.geneData.fullName && (
                              <div>
                                <span className="text-xs font-medium text-gray-700">Description:</span>
                                <div className="text-xs text-gray-600 italic">{gene.geneData.fullName}</div>
                              </div>
                            )}
                            
                            {/* Gene Synonyms */}
                            {gene.geneData.synonyms && gene.geneData.synonyms.length > 1 && (
                              <div>
                                <span className="text-xs font-medium text-gray-700">Synonyms:</span>
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {gene.geneData.synonyms.slice(0, 3).map((synonym, i) => (
                                    <span key={i} className={`inline-block px-1 py-0.5 rounded text-xs ${i === 0 ? 'bg-blue-100 text-blue-800 font-medium' : 'bg-gray-100 text-gray-700'}`}>
                                      {synonym}
                                    </span>
                                  ))}
                                  {gene.geneData.synonyms.length > 3 && (
                                    <span className="text-xs text-gray-500">+{gene.geneData.synonyms.length - 3}</span>
                                  )}
                                </div>
                              </div>
                            )}
                            
                            {/* Key Database IDs */}
                            <div className="text-xs space-y-1">
                              {gene.geneData.uniprotId && (
                                <div className="flex justify-between">
                                  <span className="text-gray-600">UniProt:</span>
                                  <a href={`https://www.uniprot.org/uniprot/${gene.geneData.uniprotId}`} 
                                     target="_blank" rel="noopener noreferrer" 
                                     className="font-mono text-green-600 hover:underline">
                                    {gene.geneData.uniprotId}
                                  </a>
                                </div>
                              )}
                              {gene.geneData.ensemblId && (
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Ensembl:</span>
                                  <span className="font-mono text-blue-600">{gene.geneData.ensemblId}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-gray-500 italic">Gene data not available</div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : sideInfo.geneData ? (
                  /* Single Gene */
                  <div className="space-y-4">
                    {/* Gene Description */}
                    {sideInfo.geneData.fullName && (
                      <div>
                        <span className="font-medium text-gray-700">Description:</span>
                        <div className="mt-1 text-xs text-gray-600 break-words italic">{sideInfo.geneData.fullName}</div>
                      </div>
                    )}
                    
                    {/* Gene Synonyms */}
                    {sideInfo.geneData.synonyms && sideInfo.geneData.synonyms.length > 1 && (
                      <div>
                        <span className="font-medium text-gray-700">Gene Synonyms:</span>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {sideInfo.geneData.synonyms.map((synonym, i) => (
                            <span key={i} className={`inline-block px-2 py-1 rounded text-xs ${i === 0 ? 'bg-blue-100 text-blue-800 font-medium' : 'bg-gray-100 text-gray-700'}`}>
                              {synonym}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Database IDs */}
                    {(sideInfo.geneData.uniprotId || sideInfo.geneData.ensemblId || sideInfo.geneData.omimId || sideInfo.geneData.ncbiGeneId) && (
                      <div>
                        <span className="font-medium text-gray-700">Database IDs:</span>
                        <div className="mt-2 text-sm space-y-1">
                          {sideInfo.geneData.uniprotId && (
                            <div className="flex justify-between items-center">
                              <span className="text-gray-600">UniProt:</span>
                              <a href={`https://www.uniprot.org/uniprot/${sideInfo.geneData.uniprotId}`} 
                                 target="_blank" rel="noopener noreferrer" 
                                 className="font-mono text-green-600 hover:underline bg-green-50 px-2 py-1 rounded text-xs">
                                {sideInfo.geneData.uniprotId}
                              </a>
                            </div>
                          )}
                          
                          {sideInfo.geneData.ensemblId && (
                            <div className="flex justify-between items-center">
                              <span className="text-gray-600">Ensembl:</span>
                              <a href={`https://www.ensembl.org/Homo_sapiens/Gene/Summary?g=${sideInfo.geneData.ensemblId}`} 
                                 target="_blank" rel="noopener noreferrer" 
                                 className="font-mono text-blue-600 hover:underline bg-blue-50 px-2 py-1 rounded text-xs">
                                {sideInfo.geneData.ensemblId}
                              </a>
                            </div>
                          )}
                          
                          {sideInfo.geneData.omimId && (
                            <div className="flex justify-between items-center">
                              <span className="text-gray-600">OMIM:</span>
                              <a href={`https://omim.org/entry/${sideInfo.geneData.omimId}`} 
                                 target="_blank" rel="noopener noreferrer" 
                                 className="font-mono text-purple-600 hover:underline bg-purple-50 px-2 py-1 rounded text-xs">
                                {sideInfo.geneData.omimId}
                              </a>
                            </div>
                          )}
                          
                          {sideInfo.geneData.ncbiGeneId && (
                            <div className="flex justify-between items-center">
                              <span className="text-gray-600">NCBI Gene:</span>
                              <a href={`https://www.ncbi.nlm.nih.gov/gene/${sideInfo.geneData.ncbiGeneId}`} 
                                 target="_blank" rel="noopener noreferrer" 
                                 className="font-mono text-orange-600 hover:underline bg-orange-50 px-2 py-1 rounded text-xs">
                                {sideInfo.geneData.ncbiGeneId}
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
                
                {/* Collapsible Additional Information */}
                {sideInfo.geneData && (sideInfo.geneData.drugs?.length > 0 || sideInfo.geneData.diseases?.length > 0 || sideInfo.geneData.ecNumber || sideInfo.geneData.chromosomePosition || sideInfo.geneData.pathways?.length > 0) && (
                  <details className="border border-gray-200 rounded-lg">
                    <summary className="cursor-pointer p-3 bg-gray-50 hover:bg-gray-100 rounded-t-lg font-medium text-gray-700">
                      Additional Information
                    </summary>
                    <div className="p-3 space-y-3">
                      {/* Drug Targets */}
                      {sideInfo.geneData.drugs && sideInfo.geneData.drugs.length > 0 && (
                        <div>
                          <span className="font-medium text-red-700">🎯 Drug Targets ({sideInfo.geneData.drugs.length}):</span>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {sideInfo.geneData.drugs.slice(0, 5).map((drug, i) => (
                              <span key={i} className="inline-block bg-red-100 text-red-800 px-2 py-1 rounded text-xs">
                                {drug}
                              </span>
                            ))}
                            {sideInfo.geneData.drugs.length > 5 && (
                              <span className="text-xs text-red-600">+{sideInfo.geneData.drugs.length - 5} more</span>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* Disease Associations */}
                      {sideInfo.geneData.diseases && sideInfo.geneData.diseases.length > 0 && (
                        <div>
                          <span className="font-medium text-yellow-700">🏥 Disease Associations:</span>
                          <div className="mt-1 text-xs text-gray-600">
                            {sideInfo.geneData.diseases.slice(0, 3).map((disease, i) => (
                              <div key={i}>• {disease}</div>
                            ))}
                            {sideInfo.geneData.diseases.length > 3 && (
                              <div className="text-gray-500">...and {sideInfo.geneData.diseases.length - 3} more</div>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* Enzyme & Location */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {sideInfo.geneData.ecNumber && (
                          <div>
                            <span className="font-medium text-indigo-700">Enzyme:</span>
                            <div className="font-mono text-indigo-600">{sideInfo.geneData.ecNumber}</div>
                          </div>
                        )}
                        
                        {sideInfo.geneData.chromosomePosition && (
                          <div>
                            <span className="font-medium text-gray-700">Location:</span>
                            <div className="font-mono text-gray-600">
                              {sideInfo.geneData.chromosomePosition.replace(/complement\(|[()]/g, '')}
                            </div>
                          </div>
                        )}
                      </div>
                      
                      {/* Key Pathways */}
                      {sideInfo.geneData.pathways && sideInfo.geneData.pathways.length > 0 && (
                        <div>
                          <span className="font-medium text-blue-700">🔗 Key Pathways ({sideInfo.geneData.pathways.length}):</span>
                          <div className="mt-1 text-xs text-blue-600 max-h-20 overflow-y-auto">
                            {sideInfo.geneData.pathways.slice(0, 3).map((pathway, i) => (
                              <div key={i}>• {pathway}</div>
                            ))}
                            {sideInfo.geneData.pathways.length > 3 && (
                              <div className="text-blue-500">...and {sideInfo.geneData.pathways.length - 3} more</div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </details>
                )}
              </div>
            ) : sideInfo.type === "group" && sideInfo.components ? (
              <div>
                <span className="font-medium text-gray-700">Components:</span>
                <div className="mt-1 text-xs text-gray-600">
                  {sideInfo.components.length} member(s): {sideInfo.components.join(", ")}
                </div>
              </div>
            ) : sideInfo.rawLabel && sideInfo.rawLabel !== sideInfo.label ? (
              <div>
                <span className="font-medium text-gray-700">Full name:</span>
                <div className="mt-1 text-xs text-gray-600 break-words">{sideInfo.rawLabel}</div>
              </div>
            ) : null}
            
            
            <div className="border-t pt-3">
              <span className="font-medium text-gray-700">Graphics:</span>
              <div className="mt-1 text-xs text-gray-600">
                <div>Position: ({sideInfo.x}, {sideInfo.y})</div>
                <div>Size: {sideInfo.w} × {sideInfo.h} px</div>
                <div>Entry ID: {sideInfo.id}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


