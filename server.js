const express = require('express');
const app = express();
const port = process.env.PORT || 10000;

let accessToken = null;
let tokenExpiresAt = 0;

// Spotify token logic
async function getSpotifyToken() {
  if (accessToken && Date.now() < tokenExpiresAt) return accessToken;

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Missing Spotify credentials');
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials'
  });
  const data = await response.json();
  if (!response.ok) throw new Error('Spotify auth failed');
  
  accessToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in - 300) * 1000;
  return accessToken;
}

// CORS for all routes
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET');
  next();
});

// Route 1: Get Spotify track
app.get('/track/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!/^[a-zA-Z0-9]+$/.test(id)) {
      return res.status(400).json({ error: 'Invalid track ID' });
    }
    const token = await getSpotifyToken();
    const response = await fetch(`https://api.spotify.com/v1/tracks/${id}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) {
      return res.status(404).json({ error: 'Track not found on Spotify' });
    }
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Spotify proxy error' });
  }
});

// Route 2: Search YouTube (server-side, no CORS!)
app.get('/search-youtube', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ error: 'Missing query' });
    }
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(q + ' audio')}`;
    const ytRes = await fetch(searchUrl);
    const html = await ytRes.text();
    const match = html.match(/watch\?v=([a-zA-Z0-9_-]{11})/);
    if (!match) {
      return res.status(404).json({ error: 'No video found' });
    }
    res.json({ videoId: match[1] });
  } catch (err) {
    console.error('YouTube search error:', err);
    res.status(500).json({ error: 'YouTube search failed' });
  }
});

app.listen(port, () => {
  console.log(`✅ Proxy running on port ${port}`);
});
