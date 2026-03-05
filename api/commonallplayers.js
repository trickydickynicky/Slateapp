export const config = {
    runtime: 'edge',
  };
export default async function handler(req, res) {
    const endpoint = req.url.split('/api/')[1].split('?')[0];
    const queryParams = new URLSearchParams(req.query);
    const queryString = queryParams.toString();
    const nbaUrl = `https://stats.nba.com/stats/${endpoint}${queryString ? `?${queryString}` : ''}`;
  
    try {
      const response = await fetch(nbaUrl, {
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Host': 'stats.nba.com',
          'Origin': 'https://www.nba.com',
          'Referer': 'https://www.nba.com/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          'x-nba-stats-origin': 'stats',
          'x-nba-stats-token': 'true',
        },
      });
  
      if (!response.ok) {
        return res.status(response.status).json({ error: `NBA API returned ${response.status}` });
      }
  
      const data = await response.json();
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(200).json(data);
    } catch (error) {
      console.error('NBA proxy error:', error);
      return res.status(500).json({ error: 'Failed to fetch from NBA API' });
    }
  }