// Vercel API route for KEGG KGML data
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { pathwayId } = req.query;
    console.log(`Fetching KGML for ${pathwayId}`);
    
    const response = await fetch(`https://rest.kegg.jp/get/${pathwayId}/kgml`);
    const xml = await response.text();
    
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(xml);
  } catch (error) {
    console.error('Error fetching KGML:', error);
    res.status(500).json({ error: 'Failed to fetch KGML' });
  }
}
