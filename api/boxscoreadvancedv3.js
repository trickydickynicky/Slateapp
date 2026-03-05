export const config = {
    runtime: 'edge',
  };
  
  export default async function handler(req) {
    const url = new URL(req.url);
    const endpoint = url.pathname.split('/api/')[1];
    const queryString = url.search;
    
    const nbaUrl = `https://stats.nba.com/stats/${endpoint}${queryString}`;
  
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
  
      const data = await response.json();
  
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 's-maxage=60',
        },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Failed to fetch from NBA API' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }