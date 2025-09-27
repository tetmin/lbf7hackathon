// Vercel API route for KEGG pathway images
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { pathwayId } = req.query;
    console.log(`Fetching image for ${pathwayId}`);
    
    const response = await fetch(`https://rest.kegg.jp/get/${pathwayId}/image`);
    const buffer = await response.arrayBuffer();
    
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('Error fetching image:', error);
    res.status(500).json({ error: 'Failed to fetch image' });
  }
}
