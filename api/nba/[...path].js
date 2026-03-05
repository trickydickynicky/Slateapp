// This file is no longer used for NBA stats fetching.
// NBA data is now fetched directly from the browser via corsproxy.io
// in PlayerGameBreakdown.jsx, bypassing Vercel's datacenter IP blocks.
//
// This file is kept as a placeholder in case you need server-side
// API proxying for other endpoints in the future.

export const config = {
  runtime: 'nodejs',
  maxDuration: 30,
};

export default async function handler(req, res) {
  return res.status(200).json({ message: 'NBA data is fetched client-side.' });
}