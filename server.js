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

// Route 3: Search Spotify by query (using your auth token)
app.get('/search-spotify', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ error: 'Missing query' });
    }
    const token = await getSpotifyToken();
    const searchUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=1`;
    const response = await fetch(searchUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) {
      return res.status(500).json({ error: 'Spotify search failed' });
    }
    const data = await response.json();
    if (data.tracks.items.length === 0) {
      return res.status(404).json({ error: 'No Spotify track found' });
    }
    const track = data.tracks.items[0];
    res.json({
      id: track.id,
      name: track.name,
      artist: track.artists[0].name,
      url: track.external_urls.spotify
    });
  } catch (err) {
    console.error('Spotify search error:', err);
    res.status(500).json({ error: 'Search error' });
  }
});

// Route 4: Get YouTube video title (improved)
app.get('/get-video-title', async (req, res) => {
  try {
    const { v } = req.query;
    if (!v) return res.status(400).json({ error: 'Missing video ID' });

    // Use oEmbed (public, reliable, no scraping)
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${v}&format=json`;
    const response = await fetch(oembedUrl);
    
    if (!response.ok) {
      // Fallback to scraping if oEmbed fails
      const htmlRes = await fetch(`https://www.youtube.com/watch?v=${v}`);
      const html = await htmlRes.text();
      const match = html.match(/"title":"([^"]+)"/);
      if (match) {
        let title = JSON.parse(`"${match[1]}"`); // decode escaped JSON string
        title = title.replace(/\s*\([^)]*official[^)]*\)/i, '');
        title = title.replace(/ audio$/i, '');
        return res.json({ title });
      }
      return res.status(404).json({ error: 'Title not found' });
    }

    const data = await response.json();
    let title = data.title;
    title = title.replace(/\s*\([^)]*official[^)]*\)/i, '');
    title = title.replace(/ audio$/i, '');
    res.json({ title });

  } catch (err) {
    console.error('Video title error:', err.message);
    res.status(500).json({ error: 'Failed to get title' });
  }
});

// UPDATED: Get Apple Music track by ID - Improved artist detection
app.get('/apple-track/:id', async (req, res) => {
  try {
    const trackId = req.params.id;
    if (!/^\d+$/.test(trackId)) {
      return res.status(400).json({ error: 'Invalid Apple Music track ID' });
    }

    console.log(`Fetching Apple Music track: ${trackId}`);

    // Method 1: Try iTunes Lookup API first (most reliable)
    try {
      const itunesResponse = await fetch(`https://itunes.apple.com/lookup?id=${trackId}&country=US`);
      if (itunesResponse.ok) {
        const data = await itunesResponse.json();
        console.log('iTunes Lookup response:', data);
        
        if (data.results && data.results.length > 0) {
          const track = data.results[0];
          
          // Validate that we have both track name and artist
          if (track.trackName && track.artistName) {
            return res.json({
              id: trackId,
              name: track.trackName,
              artist: track.artistName,
              url: track.trackViewUrl || `https://music.apple.com/us/song/${trackId}`
            });
          } else {
            console.log('iTunes API missing track name or artist:', track);
          }
        } else {
          console.log('iTunes API returned no results');
        }
      } else {
        console.log('iTunes API response not OK:', itunesResponse.status);
      }
    } catch (error) {
      console.log('iTunes Lookup failed:', error.message);
    }

    // Method 2: Try different countries if US fails
    const countries = ['US', 'GB', 'CA', 'AU', 'DE'];
    for (const country of countries) {
      try {
        const itunesResponse = await fetch(`https://itunes.apple.com/lookup?id=${trackId}&country=${country}`);
        if (itunesResponse.ok) {
          const data = await itunesResponse.json();
          if (data.results && data.results.length > 0) {
            const track = data.results[0];
            if (track.trackName && track.artistName) {
              console.log(`Found via ${country} iTunes API`);
              return res.json({
                id: trackId,
                name: track.trackName,
                artist: track.artistName,
                url: track.trackViewUrl || `https://music.apple.com/${country.toLowerCase()}/song/${trackId}`
              });
            }
          }
        }
      } catch (error) {
        console.log(`iTunes API for ${country} failed:`, error.message);
      }
    }

    // Method 3: Fallback to web scraping with better parsing
    try {
      const trackUrl = `https://music.apple.com/us/song/${trackId}`;
      const htmlRes = await fetch(trackUrl);
      const html = await htmlRes.text();
      
      console.log('Attempting web scraping for Apple Music track');
      
      // Multiple methods to extract title and artist
      let title = null;
      let artist = null;
      
      // Method 3a: Try JSON-LD structured data
      const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
      if (jsonLdMatch) {
        try {
          const jsonLd = JSON.parse(jsonLdMatch[1]);
          if (jsonLd.name) title = jsonLd.name;
          if (jsonLd.byArtist && jsonLd.byArtist.name) artist = jsonLd.byArtist.name;
        } catch (e) {
          console.log('JSON-LD parsing failed');
        }
      }
      
      // Method 3b: Try meta tags
      if (!title) {
        const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
        if (titleMatch) {
          title = titleMatch[1].split(' - ')[0]; // Remove artist from title if present
        }
      }
      
      if (!artist) {
        const artistMatch = html.match(/<meta property="music:musician" content="([^"]+)"/);
        if (artistMatch) {
          artist = artistMatch[1].split('/').pop().replace(/-/g, ' ');
        }
      }
      
      // Method 3c: Try other meta tags
      if (!artist) {
        const artistMatch2 = html.match(/<meta name="apple:artist" content="([^"]+)"/);
        if (artistMatch2) {
          artist = artistMatch2[1];
        }
      }
      
      // Method 3d: Try schema.org markup
      if (!artist) {
        const schemaMatch = html.match(/"name":"([^"]+)","@type":"MusicGroup"/);
        if (schemaMatch) {
          artist = schemaMatch[1];
        }
      }
      
      if (title && artist) {
        console.log('Found via web scraping:', { title, artist });
        return res.json({
          id: trackId,
          name: title,
          artist: artist,
          url: trackUrl
        });
      } else {
        console.log('Web scraping failed to find complete data:', { title, artist });
      }
    } catch (error) {
      console.log('Web scraping also failed:', error.message);
    }

    // Method 4: Final fallback - use iTunes search
    try {
      const searchResponse = await fetch(`https://itunes.apple.com/search?term=${trackId}&entity=song&limit=1&country=US`);
      if (searchResponse.ok) {
        const data = await searchResponse.json();
        if (data.results && data.results.length > 0) {
          const track = data.results[0];
          if (track.trackName && track.artistName) {
            console.log('Found via iTunes search');
            return res.json({
              id: trackId,
              name: track.trackName,
              artist: track.artistName,
              url: track.trackViewUrl
            });
          }
        }
      }
    } catch (error) {
      console.log('iTunes search failed:', error.message);
    }

    console.log('All methods failed for track:', trackId);
    return res.status(404).json({ error: 'Apple Music track not found or incomplete data' });

  } catch (err) {
    console.error('Apple Music track error:', err.message);
    res.status(500).json({ error: 'Failed to get Apple Music track' });
  }
});

// Route 6: Search Apple Music
app.get('/search-apple', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'Missing query' });
    
    console.log('Searching Apple Music for:', q);
    
    // Use iTunes Search API (more reliable than scraping)
    const searchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=1&media=music&country=US`;
    const response = await fetch(searchUrl);
    
    if (!response.ok) {
      return res.status(500).json({ error: 'Apple Music search failed' });
    }
    
    const data = await response.json();
    console.log('Apple Music search results:', data);
    
    if (data.results && data.results.length > 0) {
      const track = data.results[0];
      
      // Validate we have both track name and artist
      if (track.trackName && track.artistName) {
        return res.json({
          id: track.trackId,
          name: track.trackName,
          artist: track.artistName,
          url: track.trackViewUrl
        });
      } else {
        console.log('Search result missing data:', track);
        return res.status(404).json({ error: 'Incomplete track data found' });
      }
    }
    
    return res.status(404).json({ error: 'No Apple Music match found' });
    
  } catch (err) {
    console.error('Apple search error:', err.message);
    res.status(500).json({ error: 'Apple search failed' });
  }
});

app.listen(port, () => {
  console.log(`✅ Proxy running on port ${port}`);
});
