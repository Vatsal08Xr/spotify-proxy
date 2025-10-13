const express = require('express');
const app = express();
const port = process.env.PORT || 10000;

// ✅ Add CORS headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

app.get('/track/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!/^[a-zA-Z0-9]+$/.test(id)) {
      return res.status(400).json({ error: 'Invalid track ID' });
    }
    const response = await fetch(`https://api.spotify.com/v1/tracks/${id}`);
    if (!response.ok) {
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
