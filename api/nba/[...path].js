export const config = {
  runtime: 'nodejs',
  maxDuration: 30,
};

export default async function handler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host}`);
  const pathParts = url.pathname.split('/api/nba/');
const endpoint = pathParts[1] || '';

// Rebuild query string, stripping the 'path' param Vercel injects
const params = new URLSearchParams(url.search);
params.delete('path');
const queryString = params.toString() ? `?${params.toString()}` : '';

const nbaUrl = `https://stats.nba.com/stats/${endpoint}${queryString}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch(nbaUrl, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Connection': 'keep-alive',
        'Host': 'stats.nba.com',
        'Origin': 'https://www.nba.com',
        'Referer': 'https://www.nba.com/',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-site',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'x-nba-stats-origin': 'stats',
        'x-nba-stats-token': 'true',
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return res.status(response.status).json({
        error: `NBA API responded with ${response.status}`,
        url: nbaUrl,
      });
    }

    const data = await response.json();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=60');
    return res.status(200).json(data);

  } catch (error) {
    clearTimeout(timeout);
    return res.status(500).json({
      error: error.name === 'AbortError' ? 'Request timed out' : 'Failed to fetch from NBA API',
      message: error.message,
      url: nbaUrl,
    });
  }
}