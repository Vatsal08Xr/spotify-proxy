const express = require('express');
const app = express();
const port = process.env.PORT || 10000;

let accessToken = null;
let tokenExpiresAt = 0;

// Get access token using Client Credentials
async function getAccessToken() {
  if (accessToken && Date.now() < tokenExpiresAt) {
    return accessToken;
  }

  const auth = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString('base64');

  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });

    const data = await response.json();
    accessToken = data.access_token;
    tokenExpiresAt = Date.now() + (data.expires_in - 300) * 1000; // refresh 5 min early
    return accessToken;
  } catch (err) {
    console.error('Failed to get Spotify token:', err);
    throw new Error('Auth failed');
  }
}

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET');
  next();
});

app.get('/track/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!/^[a-zA-Z0-9]+$/.test(id)) {
      return res.status(400).json({ error: 'Invalid track ID' });
    }

    const token = await getAccessToken();
    const response = await fetch(`https://api.spotify.com/v1/tracks/${id}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.log('Spotify API error:', response.status, errorData);
      return res.status(404).json({ error: 'Track not found on Spotify' });
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Proxy error' });
  }
});

app.listen(port, () => {
  console.log(`Spotify proxy running on port ${port}`);
});
