// Vercel API route for bulk KEGG gene data
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { geneIds } = req.query;
    console.log(`Fetching bulk gene info for ${geneIds.split(',').length} genes`);
    
    // KEGG REST API: get gene information in bulk
    // Format: https://rest.kegg.jp/get/hsa:5604+hsa:5605+hsa:5728+...
    const keggIds = geneIds.replace(/,/g, '+'); // Convert comma-separated to plus-separated
    const response = await fetch(`https://rest.kegg.jp/get/${keggIds}`);
    const text = await response.text();
    
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(text);
  } catch (error) {
    console.error('Error fetching bulk gene info:', error);
    res.status(500).json({ error: 'Failed to fetch bulk gene info' });
  }
}
