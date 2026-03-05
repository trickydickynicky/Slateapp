export const config = {
    runtime: 'edge',
  };
  
  export default async function handler(req) {
    const url = new URL(req.url);
    
    // Extract everything after /api/nba/
    const pathParts = url.pathname.split('/api/nba/');
    const endpoint = pathParts[1] || '';
    const queryString = url.search;
    
    const nbaUrl = `https://stats.nba.com/stats/${endpoint}${queryString}`;
  
    try {
      const response = await fetch(nbaUrl, {
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Connection': 'keep-alive',
          'Host': 'stats.nba.com',
          'Origin': 'https://www.nba.com',
          'Referer': 'https://www.nba.com/',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          'x-nba-stats-origin': 'stats',
          'x-nba-stats-token': 'true',
        },
      });
  
      if (!response.ok) {
        return new Response(JSON.stringify({ 
          error: `NBA API responded with ${response.status}`,
          url: nbaUrl 
        }), {
          status: response.status,
          headers: { 'Content-Type': 'application/json' },
        });
      }
  
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
      return new Response(JSON.stringify({ 
        error: 'Failed to fetch from NBA API',
        message: error.message,
        url: nbaUrl
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }